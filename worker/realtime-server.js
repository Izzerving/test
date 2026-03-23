/**
 * Realtime server with Redis pub/sub bridge.
 * Hardened features:
 * - token/channel verification via Redis
 * - replay window by sequence cursor (clamped)
 * - subscribe rate limit per socket
 * - per-channel fanout limit
 * - ack/retry for delivered events
 */
const http = require('http');
const { WebSocketServer } = require('ws');
const Redis = require('ioredis');
const { randomUUID } = require('crypto');
const { createLogger, captureException, getErrorMessage, installGlobalErrorHandlers } = require('../lib/server/observability');

const port = Number(process.env.REALTIME_PORT || 3001);
const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const sub = new Redis(redisUrl);
const cmd = new Redis(redisUrl);

const MAX_SUBS_PER_10S = Number(process.env.REALTIME_MAX_SUBS_PER_10S || 5);
const MAX_FANOUT_PER_CHANNEL = Number(process.env.REALTIME_MAX_FANOUT_PER_CHANNEL || 500);
const MAX_REPLAY_LIMIT = Number(process.env.REALTIME_REPLAY_LIMIT || 100);
const ACK_RETRY_MS = Number(process.env.REALTIME_ACK_RETRY_MS || 5_000);
const ACK_MAX_RETRIES = Number(process.env.REALTIME_ACK_MAX_RETRIES || 3);
const MAX_PENDING_ACKS = Number(process.env.REALTIME_MAX_PENDING_ACKS || 200);
const logger = createLogger('worker.realtime');
installGlobalErrorHandlers();

const server = http.createServer();
const wss = new WebSocketServer({ server });

const channelClients = new Map(); // channel -> Set<ws>

function subscribeChannel(channel) {
  if (!channelClients.has(channel)) channelClients.set(channel, new Set());
  sub.subscribe(channel).catch(async (e) => {
    await captureException(e, { worker: 'realtime', phase: 'subscribe', channel });
    logger.error('realtime.subscribe_error', { channel, message: getErrorMessage(e) });
  });
}

function unsubscribeChannelIfEmpty(channel) {
  const set = channelClients.get(channel);
  if (set && set.size === 0) {
    channelClients.delete(channel);
    sub.unsubscribe(channel).catch(async (e) => {
      await captureException(e, { worker: 'realtime', phase: 'unsubscribe', channel });
      logger.error('realtime.unsubscribe_error', { channel, message: getErrorMessage(e) });
    });
  }
}

async function verifyTokenChannel(token, channel) {
  const userId = await cmd.get(`rt:token:${token}`);
  if (!userId) return false;
  return channel === `user:${userId}`;
}

async function getReplayEvents(channel, afterSeq = 0) {
  const raw = await cmd.lrange(`rt:events:${channel}`, 0, -1);
  const result = [];
  for (const row of raw) {
    try {
      const parsed = JSON.parse(row);
      if (!parsed.seq || parsed.seq <= afterSeq) continue;
      result.push(parsed);
    } catch {
      // no-op
    }
  }
  return result.slice(-MAX_REPLAY_LIMIT);
}

function sendWithAck(ws, eventPayload) {
  if (!ws.pendingAcks) ws.pendingAcks = new Map();
  const eventId = randomUUID();

  if (ws.pendingAcks.size >= MAX_PENDING_ACKS) {
    ws.send(JSON.stringify({ type: 'error', error: 'pending_overflow' }));
    ws.close(1013, 'backpressure');
    return;
  }

  ws.pendingAcks.set(eventId, {
    envelope: { type: 'event', eventId, event: eventPayload },
    retries: 0,
    nextRetryAt: Date.now() + ACK_RETRY_MS
  });

  ws.send(JSON.stringify({ type: 'event', eventId, event: eventPayload }));
}

function processAckRetries() {
  const now = Date.now();
  for (const client of wss.clients) {
    if (!client.pendingAcks || client.readyState !== client.OPEN) continue;

    for (const [eventId, state] of client.pendingAcks.entries()) {
      if (state.nextRetryAt > now) continue;

      if (state.retries >= ACK_MAX_RETRIES) {
        client.pendingAcks.delete(eventId);
        continue;
      }

      state.retries += 1;
      state.nextRetryAt = now + ACK_RETRY_MS;
      client.send(JSON.stringify(state.envelope));
    }
  }
}

sub.on('message', (channel, message) => {
  const set = channelClients.get(channel);
  if (!set) return;

  let parsedMessage = null;
  try {
    parsedMessage = JSON.parse(message);
  } catch {
    return;
  }

  for (const ws of set) {
    if (ws.readyState === ws.OPEN) {
      sendWithAck(ws, parsedMessage);
    }
  }
});

wss.on('connection', (ws) => {
  let joinedChannel = null;
  let subscriptionAttempts = [];

  ws.pendingAcks = new Map();
  ws.send(JSON.stringify({ type: 'connected', ts: new Date().toISOString() }));

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'ack' && typeof msg.eventId === 'string') {
        ws.pendingAcks.delete(msg.eventId);
        return;
      }

      if (msg.type === 'subscribe' && typeof msg.channel === 'string' && typeof msg.token === 'string') {
        const now = Date.now();
        subscriptionAttempts = subscriptionAttempts.filter((t) => now - t < 10_000);
        subscriptionAttempts.push(now);
        if (subscriptionAttempts.length > MAX_SUBS_PER_10S) {
          ws.send(JSON.stringify({ type: 'error', error: 'rate_limited' }));
          return;
        }

        const allowed = await verifyTokenChannel(msg.token, msg.channel);
        if (!allowed) {
          ws.send(JSON.stringify({ type: 'error', error: 'unauthorized_channel' }));
          return;
        }

        subscribeChannel(msg.channel);
        const clientSet = channelClients.get(msg.channel);
        if (clientSet.size >= MAX_FANOUT_PER_CHANNEL) {
          ws.send(JSON.stringify({ type: 'error', error: 'fanout_limit_reached' }));
          return;
        }

        joinedChannel = msg.channel;
        clientSet.add(ws);

        const cursor = Number(msg.cursor || 0);
        const replayCursor = Number.isFinite(cursor) ? cursor : 0;
        const replay = await getReplayEvents(joinedChannel, replayCursor);
        ws.send(JSON.stringify({ type: 'subscribed', channel: joinedChannel, replay, replayLimit: MAX_REPLAY_LIMIT }));
        return;
      }
    } catch {
      // no-op
    }

    ws.send(JSON.stringify({ type: 'error', error: 'unsupported_message' }));
  });

  ws.on('close', () => {
    if (joinedChannel && channelClients.get(joinedChannel)) {
      channelClients.get(joinedChannel).delete(ws);
      unsubscribeChannelIfEmpty(joinedChannel);
    }
    ws.pendingAcks?.clear();
  });
});

setInterval(processAckRetries, Math.max(1000, Math.floor(ACK_RETRY_MS / 2)));

server.listen(port, () => {
  logger.info('realtime.server_started', { port, redisUrl });
});

server.on('error', async (error) => {
  await captureException(error, { worker: 'realtime', phase: 'server' });
  logger.error('realtime.server_error', { message: getErrorMessage(error) });
});
