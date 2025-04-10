import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import Message from './models/Message.js'
import ChatRoom from './models/ChatRoom.js'
import User from './models/User.js'

import UserRouter from './routes/user.js'
import VerificationCodeRouter from './routes/verificationcode.js'
import ChatRouter from './routes/chat.js'

dotenv.config({ path: '.env.local' })

const app = express()

const MONGO_URI = process.env.MONGO_URI
const PORT = 3000

mongoose.connect(MONGO_URI)

//Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use('/user', UserRouter)
app.use('/verificationcode', VerificationCodeRouter)
app.use('/chats', ChatRouter)

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
    console.log('A user connected !', socket.id)

    socket.on('join', async () => {
        onlineUsers.set(socket.user.GoSipID, socket.id)
        console.log(`${socket.user.GoSipID} is online !`)

        const user = await User.findOne({ GoSipID: socket.user.GoSipID })

        const { friends } = user

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

            const unreadCount = await Message.countDocuments({ chatRoomID, readBy: { $ne: to } })

            io.to(receiverSocketId).emit('unreadCountUpdate', { chatRoomID, unreadCount })
        }

        socket.emit('messageSent', { message })
    })

    socket.on('markAsRead', async ({ chatRoomID, GoSipID }) => {
        await Message.updateMany({ chatRoomID, readBy: { $ne: socket.user.GoSipID } }, { $addToSet: { readBy: socket.user.GoSipID } })

        const receiverSocketId = onlineUsers.get(GoSipID)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('messagesRead', { chatRoomID, reader: socket.user.GoSipID })
        }

        const unreadCount = await Message.countDocuments({ chatRoomID, readBy: { $ne: socket.user.GoSipID } })

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

        await User.updateOne({ GoSipID }, { $addToSet: { friendRequests: socket.user.GoSipID } })

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

    socket.on('removeFriend', async ({ GoSipID, chatRoomID }) => {
        await User.updateOne({ GoSipID: socket.user.GoSipID }, { $pull: { friends: GoSipID } })

        await User.updateOne({ GoSipID }, { $pull: { friends: socket.user.GoSipID } })

        await ChatRoom.deleteOne({ chatRoomID })

        await Message.deleteMany({ chatRoomID })

        socket.emit('removedFriend', GoSipID)

        const receiverSocketId = onlineUsers.get(GoSipID)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('removedFriend', socket.user.GoSipID)
        }
    })

    socket.on('disconnect', async () => {
        for (let [GoSipID, id] of onlineUsers.entries()) {
            if (id === socket.id) {
                onlineUsers.delete(GoSipID)
                console.log(`${GoSipID} disconnected !`)

                const user = await User.findOne({ GoSipID })

                const { friends } = user

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

server.listen(PORT, () => {
    console.log(`Server Listening On Port ${PORT}`)
})