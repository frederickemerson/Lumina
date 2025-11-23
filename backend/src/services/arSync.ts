/**
 * AR Sync Service
 * WebSocket server for real-time AR state synchronization
 * Allows multiple users to view the same capsule orb in AR
 */

// @ts-ignore - WebSocketServer types may not be properly exported
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';
import { getDatabase } from '../db/database';

interface ARState {
  capsuleId: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: number;
  timestamp: number;
}

class ARSyncService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<WebSocket>> = new Map(); // capsuleId -> Set of WebSocket clients

  /**
   * Start WebSocket server
   */
  start(port: number = 8080): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const capsuleId = new URL(req.url || '', 'http://localhost').searchParams.get('capsuleId');
      
      if (!capsuleId) {
        ws.close(1008, 'Missing capsuleId parameter');
        return;
      }

      // Add client to room
      if (!this.clients.has(capsuleId)) {
        this.clients.set(capsuleId, new Set());
      }
      this.clients.get(capsuleId)!.add(ws);

      logger.info('AR client connected', { capsuleId, totalClients: this.clients.get(capsuleId)!.size });

      // Send current anchor position if available
      this.sendAnchorPosition(capsuleId, ws);

      // Handle messages
      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(capsuleId, message, ws);
        } catch (error) {
          logger.error('Error handling AR message', { error, capsuleId });
        }
      });

      // Handle disconnect
      ws.on('close', () => {
        this.clients.get(capsuleId)?.delete(ws);
        if (this.clients.get(capsuleId)?.size === 0) {
          this.clients.delete(capsuleId);
        }
        logger.info('AR client disconnected', { capsuleId });
      });
    });

    logger.info('AR sync WebSocket server started', { port });
  }

  /**
   * Send anchor position to client
   */
  private async sendAnchorPosition(capsuleId: string, ws: WebSocket): Promise<void> {
    try {
      const db = getDatabase();
      const [anchorRows] = await db.execute(
        'SELECT anchor_data FROM ar_anchors WHERE capsule_id = ?',
        [capsuleId]
      ) as [any[], any];
      const anchor = anchorRows[0] as { anchor_data: string } | undefined;

      if (anchor) {
        const position = JSON.parse(anchor.anchor_data);
        ws.send(JSON.stringify({
          type: 'anchor_position',
          capsuleId,
          position,
        }));
      }
    } catch (error) {
      logger.error('Error sending anchor position', { error, capsuleId });
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(capsuleId: string, message: any, sender: WebSocket): void {
    if (message.type === 'orb_position') {
      // Broadcast orb position to all clients viewing this capsule
      const clients = this.clients.get(capsuleId);
      if (clients) {
        const broadcastMessage = JSON.stringify({
          type: 'orb_position_update',
          capsuleId,
          position: message.position,
          rotation: message.rotation,
          scale: message.scale,
          timestamp: Date.now(),
        });

        clients.forEach((client) => {
          if (client !== sender && client.readyState === WebSocket.OPEN) {
            client.send(broadcastMessage);
          }
        });
      }
    } else if (message.type === 'set_anchor') {
      // Store anchor position in database
      this.saveAnchorPosition(capsuleId, message.position);
    }
  }

  /**
   * Save anchor position to database
   */
  private async saveAnchorPosition(capsuleId: string, position: any): Promise<void> {
    try {
      const db = getDatabase();
      await db.execute(
        'INSERT INTO ar_anchors (anchor_id, capsule_id, anchor_data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE anchor_data = ?',
        [`anchor_${capsuleId}`, capsuleId, JSON.stringify(position), JSON.stringify(position)]
      );

      logger.info('AR anchor position saved', { capsuleId, position });
    } catch (error) {
      logger.error('Error saving anchor position', { error, capsuleId });
    }
  }

  /**
   * Stop WebSocket server
   */
  stop(): void {
    if (this.wss) {
      this.wss.close();
      this.clients.clear();
      logger.info('AR sync WebSocket server stopped');
    }
  }
}

export default ARSyncService;

