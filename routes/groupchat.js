import { Router } from 'express'
import dotenv from 'dotenv'
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { verifyAuth } from '../middleware/verifyAuth.js'
import GroupChatRoom from '../models/GroupChatRoom.js'
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = Router()

dotenv.config({ path: '.env.local' })

// For Uploading Group Avatar
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Configure Multer with Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "GoSip",
        allowedFormats: ['jpg', 'png', 'jpeg'],
    },
})

const upload = multer({ storage })


// Upload Group Avatar
router.post('/uploadavatar', verifyAuth, upload.single('groupAvatar'), (req, res) => {
    return res.json({ groupAvatar: req.file.path })
})

// Get All Group Chat Rooms
router.get('/', verifyAuth, async (req, res) => {
    try {
        const groupChatRooms = await GroupChatRoom.find({ members: req.user.GoSipID }).sort({ updatedAt: -1 })

        if (groupChatRooms.length === 0) {
            return res.json([])
        }

        const enrichedData = await Promise.all(groupChatRooms.map(async (room) => {

            const unreadCount = await Message.countDocuments({
                chatRoomID: room.groupChatRoomID,
                readBy: { $nin: [req.user.GoSipID] },
            })

            return {
                groupChatRoomID: room.groupChatRoomID,
                groupName: room.groupName,
                groupAvatar: room.groupAvatar,
                unreadCount,
            }
        }))

        return res.json({ groupChatRooms: enrichedData })

    } catch (error) {
        return res.status(500).json({ error: 'Cannot Fetch Group Chat Rooms ! Server Error !' })
    }
})

// Get All Messages and All Users Information and Group Information
router.post('/messages', verifyAuth, async (req, res) => {
    const { groupChatRoomID } = req.body
    
    if (!groupChatRoomID) {
        return res.status(400).json({ error: 'Group Chat ID Is Required !' })
    }

    const groupChatRoom = await GroupChatRoom.findOne({ groupChatRoomID })

    if (!groupChatRoom) {
        return res.status(404).json({ error: 'No Group Chat Found !' })
    }

    try {

        const messages = await Message.find({ chatRoomID: groupChatRoomID, deletedFor: { $nin: [req.user.GoSipID] } })
    
        const users = await Promise.all(groupChatRoom.members.map(async (GoSipID) => {
            const user = await User.findOne({ GoSipID })
    
            return {
                name: user.name,
                GoSipID: user.GoSipID,
                profilePic: user.profilePic,
                color: user.color,
            }
        }))

        return res.json({ groupName: groupChatRoom.groupName, groupAvatar: groupChatRoom.groupAvatar, groupAdmin: groupChatRoom.admin, messages, users })

    } catch (error) {
        return res.status(500).json({ error: 'Cannot Fetch Group Chat Messages ! Server Error !' })
    }

})

// Delete all messages for User
router.post('/deletemessagesforme', verifyAuth, async (req, res) => {

    const { groupChatRoomID } = req.body

    if (!groupChatRoomID) {
        return res.status(400).json({ error: 'Group Chat Room ID is required !' })
    }

    await Message.updateMany({ chatRoomID: groupChatRoomID }, { $addToSet: { deletedFor: req.user.GoSipID } })

    return res.json({ success: true })
})

export default router