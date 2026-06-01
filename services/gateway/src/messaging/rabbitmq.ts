import amqp, { type ConfirmChannel } from 'amqplib';
import { config } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { EXCHANGE, assertTopology } from './topology.js';

type Connection = Awaited<ReturnType<typeof amqp.connect>>;

const RECONNECT_DELAY_MS = 3000;

/**
 * RabbitMQ connection manager. A single durable connection + confirm channel,
 * with automatic reconnection. Publishing uses publisher confirms so the outbox
 * relay only marks a row PUBLISHED once the broker has acknowledged it. If the
 * broker is unavailable the gateway still serves traffic — writes accumulate in
 * the outbox and drain once the connection is restored.
 */
class RabbitMQ {
  private connection: Connection | null = null;
  private channel: ConfirmChannel | null = null;
  private connecting: Promise<void> | null = null;
  private closing = false;

  constructor(private readonly url: string | undefined) {}

  isReady(): boolean {
    return this.channel !== null;
  }

  async connect(): Promise<void> {
    if (!this.url) {
      logger.warn('RABBITMQ_URL not set — messaging disabled');
      return;
    }
    if (this.channel || this.connecting) {
      await this.connecting;
      return;
    }
    this.connecting = this.establish(this.url);
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private async establish(url: string): Promise<void> {
    try {
      const connection = await amqp.connect(url);
      connection.on('error', (err) => logger.error({ err }, 'rabbitmq connection error'));
      connection.on('close', () => this.handleClose());

      const channel = await connection.createConfirmChannel();
      channel.on('error', (err) => logger.error({ err }, 'rabbitmq channel error'));
      await assertTopology(channel);

      this.connection = connection;
      this.channel = channel;
      logger.info('rabbitmq connected; topology asserted');
    } catch (err) {
      this.connection = null;
      this.channel = null;
      logger.error({ err }, 'rabbitmq connection failed; will retry');
      this.scheduleReconnect();
    }
  }

  private handleClose(): void {
    this.connection = null;
    this.channel = null;
    if (this.closing) return;
    logger.warn('rabbitmq connection closed; reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closing) return;
    setTimeout(() => void this.connect(), RECONNECT_DELAY_MS).unref();
  }

  /** Publish to the topic exchange, resolving only on a broker ack (confirm). */
  async publish(routingKey: string, payload: unknown, options: { messageId?: string } = {}): Promise<void> {
    const channel = this.channel;
    if (!channel) {
      throw new Error('rabbitmq channel not available');
    }
    const content = Buffer.from(JSON.stringify(payload));
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        EXCHANGE,
        routingKey,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Math.floor(Date.now() / 1000),
          ...(options.messageId ? { messageId: options.messageId } : {}),
        },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async close(): Promise<void> {
    this.closing = true;
    try {
      await this.channel?.close();
    } catch {
      // already closing
    }
    try {
      await this.connection?.close();
    } catch {
      // already closing
    }
    this.channel = null;
    this.connection = null;
  }
}

export const rabbit = new RabbitMQ(config.RABBITMQ_URL);
