import mongoose from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const GroupChatRoomSchema = new mongoose.Schema({
    groupChatRoomID: {type: String, default: uuidv4},
    groupName: {type: String, required: true},
    groupAvatar: {type: String, required: true},
    members: {type: [String], default: []},
    admin: {type: String, required: true},
    createdAt: {type: Date, default: Date.now},
    updatedAt: {type: Date, default: Date.now},
})

const GroupChatRoom = mongoose.models.GroupChatRoom || mongoose.model('GroupChatRoom', GroupChatRoomSchema)
export default GroupChatRoom