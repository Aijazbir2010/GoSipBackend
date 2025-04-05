import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema({
    chatRoomID: {type: String, required: true},
    senderGoSipID: {type: String, required: true},
    text: {type: String, required: true},
    createdAt: {type: Date, default: Date.now},
    readBy: [String],
})

const Message = mongoose.models.Message || mongoose.model('Message', MessageSchema)
export default Message