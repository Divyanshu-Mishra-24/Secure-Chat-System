from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
import json
import logging

logger = logging.getLogger("websocket_manager")

class ConnectionManager:
    def __init__(self):
        # user_id -> Set of WebSocket connections (allows multiple tabs/devices per user)
        self.active_connections: Dict[int, Set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected via WebSocket. Active sessions: {len(self.active_connections[user_id])}")

    def disconnect(self, user_id: int, websocket: WebSocket) -> bool:
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        logger.info(f"User {user_id} disconnected from WebSocket.")
        return user_id in self.active_connections

    def is_connected(self, user_id: int) -> bool:
        return bool(self.active_connections.get(user_id))

    async def send_personal_message(self, user_id: int, message: dict) -> bool:
        delivered = False
        if user_id in self.active_connections:
            dead_sockets = set()
            for websocket in self.active_connections[user_id]:
                try:
                    await websocket.send_text(json.dumps(message))
                    delivered = True
                except Exception as e:
                    logger.error(f"Error sending message to user {user_id}: {e}")
                    dead_sockets.add(websocket)
            for dead in dead_sockets:
                self.active_connections[user_id].discard(dead)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        return delivered

    async def broadcast_to_users(self, user_ids: list[int], message: dict) -> set[int]:
        delivered_users = set()
        for uid in user_ids:
            if await self.send_personal_message(uid, message):
                delivered_users.add(uid)
        return delivered_users

    async def broadcast_all(self, message: dict):
        for uid in list(self.active_connections.keys()):
            await self.send_personal_message(uid, message)

manager = ConnectionManager()
