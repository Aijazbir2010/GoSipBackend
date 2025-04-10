import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
    chatRoomID: {type: String, required: true},
    senderGoSipID: {type: String, required: true},
    text: {type: String, required: true},
    createdAt: {type: Date, default: Date.now, expires: 86400}, // 24 Hours = 60 * 60 * 24 = 86400 Seconds
    readBy: [String],
    deletedFor: {type: [String], default: []}
})

const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema)
export default Message