use dashmap::DashMap;
use actix_ws::Session;

/// One entry per chat room — holds all active client sessions
pub type ChatRooms = DashMap<String, Vec<Session>>;

pub fn new_chat_rooms() -> ChatRooms {
    DashMap::new()
}
