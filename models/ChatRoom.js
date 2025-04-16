import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const ChatRoomSchema = new mongoose.Schema({
    chatRoomID: {type: String, default: uuidv4},
    members: {type: [String], default: []},
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now},
})

const ChatRoom = mongoose.models.ChatRoom || mongoose.model('ChatRoom', ChatRoomSchema)
export default ChatRoom