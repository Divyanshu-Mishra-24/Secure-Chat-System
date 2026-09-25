from pydantic import BaseModel
from typing import Optional, List, Any

# Auth models
class StartAuthRequest(BaseModel):
    identifier: str
    is_registration: bool = False

class VerifyAuthRequest(BaseModel):
    identifier: str
    otp: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_registration: bool = False

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    status_message: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    identifier: str
    display_name: str
    avatar_url: Optional[str] = None
    status_message: Optional[str] = "Available"
    is_online: bool = False
    last_seen: Optional[str] = None
    safety_number: Optional[str] = None

# Contact models
class AddContactRequest(BaseModel):
    identifier: str

# Conversation models
class CreateDirectConversationRequest(BaseModel):
    contact_user_id: int

class CreateGroupConversationRequest(BaseModel):
    name: str
    member_user_ids: List[int]
    avatar_url: Optional[str] = None

class SetDisappearingTimerRequest(BaseModel):
    disappearing_timer: int # in seconds (0 = off)

class GroupMemberUpdate(BaseModel):
    user_id: int

# Message models
class SendMessageRequest(BaseModel):
    # The conversation is also part of the URL. Keep this optional for older clients,
    # and validate it against the URL when supplied.
    conversation_id: Optional[int] = None
    content: Optional[str] = ""
    reply_to_id: Optional[int] = None
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None

class ReactionRequest(BaseModel):
    emoji: str
