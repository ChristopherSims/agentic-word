//! Presence tracking stub. Phase 7.

#[derive(Debug, Clone)]
pub struct CollabUser {
    pub id: String,
    pub name: String,
    pub color: String,
    pub cursor_position: Option<(usize, usize)>,
}

pub struct PresenceTracker {
    users: std::collections::HashMap<String, CollabUser>,
}

impl PresenceTracker {
    pub fn new() -> Self {
        PresenceTracker { users: std::collections::HashMap::new() }
    }
    pub fn add_user(&mut self, user: CollabUser) {
        self.users.insert(user.id.clone(), user);
    }
    pub fn remove_user(&mut self, id: &str) {
        self.users.remove(id);
    }
    pub fn list_users(&self) -> Vec<&CollabUser> {
        self.users.values().collect()
    }
}
