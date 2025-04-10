import { Router } from "express";
import User from "../models/User.js";
import ChatRoom from "../models/ChatRoom.js";
import Message from "../models/Message.js";
import { verifyAuth } from "../middleware/verifyAuth.js";

const router = Router()

// Get All Chat Rooms and Friends Information
router.get('/', verifyAuth, async (req, res) => {
    const { GoSipID } = req.user

    try {

        const chatRooms = await ChatRoom.find({ members: GoSipID }).sort({ updatedAt: -1 })
    
        if (chatRooms.length === 0) {
            return res.json([])
        }

        const enrichedData = await Promise.all(chatRooms.map(async (room) => {
            const friendGoSipID = room.members.find(id => id !== GoSipID)
    
            const friend = await User.findOne({ GoSipID: friendGoSipID })
    
            const unreadCount = await Message.countDocuments({
                chatRoomID: room.chatRoomID,
                readBy: { $nin: [GoSipID] }
            })
    
            return {
                chatRoomID: room.chatRoomID,
                friend: {
                    name: friend.name,
                    profilePic: friend.profilePic,
                    GoSipID: friend.GoSipID,
                },
                unreadCount,
            }
        }))
    
        return res.json(enrichedData)
    } catch (error) {
        console.log(error)
        return res.status(500).json({ error: 'Cannot Fetch Chat Rooms ! Server Error !' })
    }
})

// Get All Messages Of A Chat and Friend Data
router.post('/messages', verifyAuth, async (req, res) => {
    const { GoSipID } = req.user
    const { chatRoomID } = req.body

    if (!chatRoomID) {
        return res.status(400).json({ error: 'Chat Room ID Is Required !' })
    }

    const chatRoom = await ChatRoom.findOne({ chatRoomID, members: GoSipID })

    if (!chatRoom) {
        return res.status(404).json({ error: 'No Chat Found !' })
    }

    const friendGoSipID = chatRoom.members.find(id => id !== GoSipID)

    try {

        const friend = await User.findOne({ GoSipID: friendGoSipID })
    
        const messages = await Message.find({ chatRoomID, deletedFor: { $ne: GoSipID } })
    
        const data = {
            friend: {
                name: friend.name,
                GoSipID: friend.GoSipID,
                profilePic: friend.profilePic,
                isOnline: friend.isOnline,
            },
            messages,
        }
    
        return res.json(data)
        
    } catch (error) {
        return res.status(500).json({ error: 'Cannot Fetch Messages ! Server Error !' })
    }

})

// Delete all messages for User
router.post('/deletemessagesforme', verifyAuth, async (req, res) => {
    const { chatRoomID } = req.body
    const { GoSipID } = req.user

    if (!chatRoomID) {
        return res.status(400).json({ error: 'Chat Room ID is rquired !' })
    }

    await Message.updateMany({ chatRoomID }, { $addToSet: { deletedFor: GoSipID } })

    return res.json({ success: true })
})

export default router