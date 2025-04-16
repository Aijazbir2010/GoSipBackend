import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { v2 as cloudinary } from 'cloudinary'

import Message from './models/Message.js'
import ChatRoom from './models/ChatRoom.js'
import GroupChatRoom from './models/GroupChatRoom.js'
import User from './models/User.js'

import UserRouter from './routes/user.js'
import VerificationCodeRouter from './routes/verificationcode.js'
import ChatRouter from './routes/chat.js'
import GroupChatRouter from './routes/groupchat.js'

dotenv.config({ path: '.env.local' })

const app = express()

const MONGO_URI = process.env.MONGO_URI
const PORT = 3000

mongoose.connect(MONGO_URI)

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

//Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use('/user', UserRouter)
app.use('/verificationcode', VerificationCodeRouter)
app.use('/chats', ChatRouter)
app.use('/groupchats', GroupChatRouter)

const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
    }
})

const onlineUsers = new Map()

// Middleware to check if the user that establishes connection is authenticated
io.use((socket, next) => {
    const req = socket.request

    const cookies = req.headers.cookie

    if (!cookies) {
        return next(new Error('No Cookies Found !')) // Reject Request by using Error as parameter in next()
    }

    const parseCookies = (cookieString) => {
        return Object.fromEntries(
            cookieString.split(';').map(cookie => {
                const [name, ...rest] = cookie.trim().split('=')
                return [name, decodeURIComponent(rest.join('='))]
            })
        )
    }

    const parsedCookies = parseCookies(cookies)

    const token = parsedCookies.accessToken

    if (!token) {
        return next(new Error('Access Token Missing !'))
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
        socket.user = decoded
        next()
    } catch (error) {
        return next(new Error('Invalid or Expired Token !'))
    }
})

io.on('connection', (socket) => {

    socket.on('join', async () => {
        onlineUsers.set(socket.user.GoSipID, socket.id)

        const user = await User.findOne({ GoSipID: socket.user.GoSipID })

        const { friends } = user

        if (!friends) {
            return
        }

        friends.forEach((friendID) => {
            const friendSocketID = onlineUsers.get(friendID)
            if (friendSocketID) {
                io.to(friendSocketID).emit('userOnline', socket.user.GoSipID)
            }
        })

        const onlineFriends = friends.filter((friendID) => onlineUsers.has(friendID))

        socket.emit('onlineFriendsList', onlineFriends)
    })

    socket.on('sendMessage', async ({ to, message, chatRoomID }) => {
        const newMessage = await Message.create({ chatRoomID, senderGoSipID: socket.user.GoSipID, text: message, readBy: [socket.user.GoSipID] })
        await ChatRoom.updateOne({ chatRoomID }, { updatedAt: new Date(Date.now()) })

        const receiverSocketId = onlineUsers.get(to)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receiveMessage', { from: socket.user.GoSipID, message, chatRoomID, createdAt: newMessage.createdAt })

            const unreadCount = await Message.countDocuments({ chatRoomID, readBy: { $nin: [to] } })

            io.to(receiverSocketId).emit('unreadCountUpdate', { chatRoomID, unreadCount })
        }
    })

    socket.on('markAsRead', async ({ chatRoomID, GoSipID }) => {
        await Message.updateMany({ chatRoomID, readBy: { $nin: [socket.user.GoSipID] } }, { $addToSet: { readBy: socket.user.GoSipID } })

        const receiverSocketId = onlineUsers.get(GoSipID)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('messagesRead', { chatRoomID, reader: socket.user.GoSipID })
        }

        const unreadCount = await Message.countDocuments({ chatRoomID, readBy: { $nin: [socket.user.GoSipID] } })

        socket.emit('unreadCountUpdate', { chatRoomID, unreadCount })
    
    })

    socket.on('typing', ({ to, chatRoomID }) => {
        const receiverSocketId = onlineUsers.get(to)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('typing', { chatRoomID })
        }
    })

    socket.on('stopTyping', ({ to, chatRoomID }) => {
        const receiverSocketId = onlineUsers.get(to)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('stopTyping', { chatRoomID })
        }
    })

    socket.on('sendFriendRequest', async ({ GoSipID }) => {

        const user = await User.findOne({ GoSipID: socket.user.GoSipID })

        await User.updateOne({ GoSipID }, { $addToSet: { friendRequests: socket.user.GoSipID }, $inc: { unreadNotifications: 1 } })

        const receiverSocketId = onlineUsers.get(GoSipID)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('friendRequestReceived', { name: user.name, GoSipID: user.GoSipID, profilePic: user.profilePic })
        }
    })

    socket.on('acceptRequest', async (GoSipID) => {
        const user = await User.findOneAndUpdate({ GoSipID: socket.user.GoSipID }, { $pull: { friendRequests: GoSipID }, $addToSet: { friends: GoSipID } }, { new: true })

        const friend = await User.findOneAndUpdate({ GoSipID }, { $addToSet: { friends: socket.user.GoSipID } }, { new: true })

        const chatRoom = await ChatRoom.create({ members: [socket.user.GoSipID, GoSipID] })

        socket.emit('acceptedRequest', {
            chatRoomID: chatRoom.chatRoomID,
            friend: {
                name: friend.name,
                GoSipID: friend.GoSipID,
                profilePic: friend.profilePic,
            },
            unreadCount: 0,
        })

        const receiverSocketId = onlineUsers.get(GoSipID)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('acceptedRequest', {
                chatRoomID: chatRoom.chatRoomID,
                friend: {
                    name: user.name,
                    GoSipID: user.GoSipID,
                    profilePic: user.profilePic
                },
                unreadCount: 0,
            })

            io.to(receiverSocketId).emit('userOnline', socket.user.GoSipID)
            
            socket.emit('userOnline', friend.GoSipID)
        }
    })

    socket.on('removeFriend', async ({ GoSipID, chatRoomID }, callback) => {
        await User.updateOne({ GoSipID: socket.user.GoSipID }, { $pull: { friends: GoSipID } })

        await User.updateOne({ GoSipID }, { $pull: { friends: socket.user.GoSipID } })

        await ChatRoom.deleteOne({ chatRoomID })

        await Message.deleteMany({ chatRoomID })

        socket.emit('removedFriend', GoSipID)

        const receiverSocketId = onlineUsers.get(GoSipID)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('removedFriend', socket.user.GoSipID)
        }

        callback()
    })

    socket.on('createGroup', async ({ groupName, groupAvatar, members }, callback) => {
        const groupChatRoom = await GroupChatRoom.create({ groupName, groupAvatar, members: [socket.user.GoSipID, ...members], admin: socket.user.GoSipID })

        socket.emit('groupCreated', {
            groupChatRoomID: groupChatRoom.groupChatRoomID,
            groupName: groupChatRoom.groupName,
            groupAvatar: groupChatRoom.groupAvatar,
            unreadCount: 0
        })

        members.map((GoSipID) => {
            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('groupCreated', {
                    groupChatRoomID: groupChatRoom.groupChatRoomID,
                    groupName: groupChatRoom.groupName,
                    groupAvatar: groupChatRoom.groupAvatar,
                    unreadCount: 0
                })
            }

            return
        })

        callback()
    })

    socket.on('changeGroupName', async ({ groupChatRoomID, newName }, callback) => {
        const groupChatRoom = await GroupChatRoom.findOneAndUpdate({ groupChatRoomID }, { groupName: newName }, { new: true })

        socket.emit('groupUpdated', { groupChatRoomID: groupChatRoom.groupChatRoomID, groupName: groupChatRoom.groupName, groupAvatar: groupChatRoom.groupAvatar })

        groupChatRoom.members.map((GoSipID) => {
            if (GoSipID === socket.user.GoSipID) return

            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('groupUpdated', { groupChatRoomID: groupChatRoom.groupChatRoomID, groupName: groupChatRoom.groupName, groupAvatar: groupChatRoom.groupAvatar })
            }
        })

        callback()
    })

    socket.on('changeGroupAvatar', async ({ groupChatRoomID, fileType, fileData }, callback) => {
        try {
            const base64Data = fileData.split(',')[1] // Remove "data:image/png;base64,"

            const uploadedFile = await cloudinary.uploader.upload(
                `data:${fileType};base64,${base64Data}`,
                {
                    folder: 'GoSip',
                    allowed_formats: ['jpg', 'png', 'jpeg'],
                }
            )

            const groupChatRoom = await GroupChatRoom.findOneAndUpdate({ groupChatRoomID }, { groupAvatar: uploadedFile.secure_url }, { new: true })

            socket.emit('groupUpdated', { groupChatRoomID: groupChatRoom.groupChatRoomID, groupName: groupChatRoom.groupName, groupAvatar: groupChatRoom.groupAvatar })

            groupChatRoom.members.map((GoSipID) => {
                if (GoSipID === socket.user.GoSipID) return

                const receiverSocketId = onlineUsers.get(GoSipID)

                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('groupUpdated', { groupChatRoomID: groupChatRoom.groupChatRoomID, groupName: groupChatRoom.groupName, groupAvatar: groupChatRoom.groupAvatar })
                }
            })

            callback()
        } catch (error) {
            callback()
        }
    })

    socket.on('leaveGroupAdmin', async ({ groupChatRoomID, newAdmin }, callback) => {
        const groupChatRoom = await GroupChatRoom.findOneAndUpdate({ groupChatRoomID }, { $pull: { members: socket.user.GoSipID }, admin: newAdmin }, { new: true })

        socket.emit('adminLeftGroup', { groupChatRoomID, GoSipID: socket.user.GoSipID, newAdmin })
        socket.emit('leftGroup', { GoSipID: socket.user.GoSipID, groupChatRoomID })

        groupChatRoom.members.map((GoSipID) => {
            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('adminLeftGroup', { groupChatRoomID, GoSipID: socket.user.GoSipID, newAdmin })
            }
        })

        callback()
    })

    socket.on('leaveGroup', async (groupChatRoomID, callback) => {
        const groupChatRoom = await GroupChatRoom.findOneAndUpdate({ groupChatRoomID }, { $pull: { members: socket.user.GoSipID } }, { new: true })

        socket.emit('leftGroup', { GoSipID: socket.user.GoSipID, groupChatRoomID })

        groupChatRoom.members.map((GoSipID) => {
            const receiverSocketId = onlineUsers.get(GoSipID)

            io.to(receiverSocketId).emit('leftGroup', { GoSipID: socket.user.GoSipID, groupChatRoomID })
        })

        callback()
    })

    socket.on('addMembers', async ({ groupChatRoomID, membersToAdded }, callback) => {

        const groupChatRoom = await GroupChatRoom.findOne({ groupChatRoomID })

        const usersToAdded = await Promise.all(membersToAdded.map(async (GoSipID) => {
            await GroupChatRoom.updateOne({ groupChatRoomID }, { $addToSet: { members: GoSipID } })

            const user = await User.findOne({ GoSipID })

            const receiverSocketId = onlineUsers.get(GoSipID)

            const unreadCount = await Message.countDocuments({
                chatRoomID: groupChatRoomID,
                readBy: { $nin: [GoSipID] }
            })

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('addedToNewGroup', {
                    groupChatRoomID,
                    groupName: groupChatRoom.groupName,
                    groupAvatar: groupChatRoom.groupAvatar,
                    unreadCount,
                })
            }

            return {
                name: user.name,
                GoSipID: user.GoSipID,
                profilePic: user.profilePic,
                color: user.color,
            }
        }))

        groupChatRoom.members.map((GoSipID) => {
            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('membersAdded', { groupChatRoomID, membersAdded: usersToAdded })
            }
        })

        callback()
    })

    socket.on('deleteGroup', async (groupChatRoomID, callback) => {
        const groupChatRoom = await GroupChatRoom.findOneAndDelete({ groupChatRoomID })
        await Message.deleteMany({ chatRoomID: groupChatRoomID })

        groupChatRoom.members.map((GoSipID) => {
            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('groupDeleted', groupChatRoomID)
            }
        })

        callback()

    })

    socket.on('sendGroupMessage', async ({ message, groupChatRoomID }) => {
        const newMessage = await Message.create({ chatRoomID: groupChatRoomID, senderGoSipID: socket.user.GoSipID, text: message, readBy: [socket.user.GoSipID] })
        const groupChatRoom = await GroupChatRoom.findOneAndUpdate({ groupChatRoomID }, { updatedAt: new Date(Date.now()) })

        await Promise.all(groupChatRoom.members.map(async (GoSipID) => {

            if (GoSipID === socket.user.GoSipID) {
                return
            }

            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receiveMessage', { from: socket.user.GoSipID, message, chatRoomID: groupChatRoomID, createdAt: newMessage.createdAt })

                const unreadCount = await Message.countDocuments({ chatRoomID: groupChatRoomID, readBy: { $nin: [GoSipID] } })

                io.to(receiverSocketId).emit('unreadCountUpdate', { chatRoomID: groupChatRoomID, unreadCount })
            }
        }))
    })

    socket.on('groupMessagesMarkAsRead', async (groupChatRoomID) => {
        await Message.updateMany({ chatRoomID: groupChatRoomID, readBy: { $nin: [socket.user.GoSipID] } }, { $addToSet: { readBy: socket.user.GoSipID } })

        const groupChatRoom = await GroupChatRoom.findOne({ groupChatRoomID })

        groupChatRoom.members.map((GoSipID) => {
            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('groupMessagesRead', { groupChatRoomID, reader: socket.user.GoSipID })
            }
        })

        const unreadCount = await Message.countDocuments({ chatRoomID: groupChatRoomID, readBy: { $nin: [socket.user.GoSipID] } })

        socket.emit('unreadCountUpdate', { chatRoomID: groupChatRoomID, unreadCount })
    })

    socket.on('groupTyping', async ({ name, groupChatRoomID }) => {
        const groupChatRoom = await GroupChatRoom.findOne({ groupChatRoomID })

        groupChatRoom.members.map((GoSipID) => {
            if (GoSipID === socket.user.GoSipID) {
                return
            }

            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('groupTyping', { name, groupChatRoomID })
            }
        })
    })

    socket.on('groupStopTyping', async (groupChatRoomID) => {
        const groupChatRoom = await GroupChatRoom.findOne({ groupChatRoomID })

        groupChatRoom.members.map((GoSipID) => {
            if (GoSipID === socket.user.GoSipID) {
                return
            }

            const receiverSocketId = onlineUsers.get(GoSipID)

            if (receiverSocketId) {
                io.to(receiverSocketId).emit('groupStopTyping', groupChatRoomID)
            }
        })
    })

    socket.on('disconnect', async () => {
        for (let [GoSipID, id] of onlineUsers.entries()) {
            if (id === socket.id) {
                onlineUsers.delete(GoSipID)

                const user = await User.findOne({ GoSipID })

                const { friends } = user

                if (!friends) {
                    return
                }

                friends.forEach((friendID) => {
                    const friendSocketID = onlineUsers.get(friendID)
                    if (friendSocketID) {
                        io.to(friendSocketID).emit('userOffline', GoSipID)
                    }
                })

                break
            }
        }
    })
})

server.listen(PORT)