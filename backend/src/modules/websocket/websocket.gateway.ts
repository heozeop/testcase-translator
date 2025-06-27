import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WebSocketService } from './websocket.service';

@WSGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/',
})
export class WebSocketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketGateway.name);

  constructor(private readonly websocketService: WebSocketService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id} from ${client.handshake.address}`);
    this.websocketService.addClient(client);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.websocketService.removeClient(client.id);
  }

  @SubscribeMessage('join_session')
  handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; projectId?: string }
  ): void {
    if (!data.sessionId) {
      client.emit('error', { message: 'Session ID is required' });
      return;
    }

    this.websocketService.updateClientActivity(client.id, data);
    this.websocketService.joinSession(client.id, data.sessionId);
  }

  @SubscribeMessage('leave_session')
  handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ): void {
    if (!data.sessionId) {
      client.emit('error', { message: 'Session ID is required' });
      return;
    }

    this.websocketService.leaveSession(client.id, data.sessionId);
  }

  @SubscribeMessage('input_response')
  handleInputResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { requestId: string; value: any; cancelled?: boolean }
  ): void {
    this.websocketService.updateClientActivity(client.id);
    this.websocketService.handleInputResponse(client.id, data);
  }

  @SubscribeMessage('ping')
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any
  ): void {
    this.websocketService.updateClientActivity(client.id, data);
    client.emit('pong', { 
      timestamp: new Date().toISOString(),
      received: data 
    });
  }

  @SubscribeMessage('get_session_info')
  handleGetSessionInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ): void {
    if (!data.sessionId) {
      client.emit('error', { message: 'Session ID is required' });
      return;
    }

    const sessionClients = this.websocketService.getSessionClients(data.sessionId);
    client.emit('session_info', {
      sessionId: data.sessionId,
      clients: sessionClients,
      totalClients: sessionClients.length,
    });
  }

  @SubscribeMessage('broadcast_to_session')
  handleBroadcastToSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; event: string; payload: any }
  ): void {
    if (!data.sessionId || !data.event) {
      client.emit('error', { message: 'Session ID and event are required' });
      return;
    }

    this.websocketService.broadcastToSession(data.sessionId, data.event, data.payload);
  }

  // Admin/monitoring endpoints
  @SubscribeMessage('get_connected_clients')
  handleGetConnectedClients(@ConnectedSocket() client: Socket): void {
    const clients = this.websocketService.getConnectedClients();
    client.emit('connected_clients', {
      clients,
      totalCount: clients.length,
    });
  }

  @SubscribeMessage('exploration_update')
  handleExplorationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      type: 'page_loaded' | 'action_executed' | 'screenshot_taken' | 'form_detected' | 'error';
      payload: any;
    }
  ): void {
    if (!data.sessionId || !data.type) {
      client.emit('error', { message: 'Session ID and type are required' });
      return;
    }

    this.websocketService.updateClientActivity(client.id, { sessionId: data.sessionId });
    this.websocketService.broadcastToSession(data.sessionId, 'exploration_update', {
      type: data.type,
      payload: data.payload,
      from: client.id,
    });
  }

  @SubscribeMessage('generation_progress')
  handleGenerationProgress(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      stage: string;
      progress: number;
      message?: string;
      payload?: any;
    }
  ): void {
    if (!data.sessionId || !data.stage) {
      client.emit('error', { message: 'Session ID and stage are required' });
      return;
    }

    this.websocketService.updateClientActivity(client.id, { sessionId: data.sessionId });
    this.websocketService.broadcastToSession(data.sessionId, 'generation_progress', {
      stage: data.stage,
      progress: data.progress || 0,
      message: data.message,
      payload: data.payload,
      from: client.id,
    });
  }
}