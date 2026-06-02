import type { Channel, ConsumeMessage } from 'amqplib';
import { logger } from '../observability/logger.js';
import { rabbit } from '../messaging/rabbitmq.js';
import { QUEUE, assertTopology } from '../messaging/topology.js';
import { EventType } from '../messaging/events.js';
import { publishAttendance, type AttendanceEvent } from './broadcaster.js';

/**
 * Consumes the `facevec.notifications` queue and forwards `attendance.recorded`
 * events to the WebSocket broadcaster. Competing consumers across replicas mean
 * each event is consumed once; the broadcaster then fans it out to every
 * replica's subscribers via Redis pub/sub.
 */
class NotificationsConsumer {
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    rabbit.onConnected(() => void this.consume());
  }

  private async consume(): Promise<void> {
    try {
      const channel = await rabbit.createChannel();
      await assertTopology(channel);
      await channel.prefetch(20);
      await channel.consume(QUEUE.NOTIFICATIONS, (msg) => {
        if (msg) this.handle(channel, msg);
      });
      logger.info('notifications consumer attached');
    } catch (err) {
      logger.error({ err }, 'failed to start notifications consumer');
    }
  }

  private handle(channel: Channel, msg: ConsumeMessage): void {
    try {
      if (msg.fields.routingKey === EventType.AttendanceRecorded) {
        const payload = JSON.parse(msg.content.toString()) as Omit<AttendanceEvent, 'type'>;
        void publishAttendance({ type: 'attendance.recorded', ...payload });
      }
      // Other notification routing keys are ignored (no live-feed mapping yet).
    } catch (err) {
      logger.error({ err }, 'failed to handle notification');
    } finally {
      channel.ack(msg);
    }
  }
}

export const notificationsConsumer = new NotificationsConsumer();
