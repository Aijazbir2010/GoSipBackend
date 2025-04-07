import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
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
    }
})

const onlineUsers = new Map()

io.on('connection', (socket) => {
    console.log('A user connected !', socket.id)

    socket.on('join', async (GoSipID) => {
        onlineUsers.set(GoSipID, socket.id)
        console.log(`${GoSipID} is online !`)

        const user = await User.findOne({ GoSipID })

        const { friends } = user

        friends.forEach((friendID) => {
            const friendSocketID = onlineUsers.get(friendID)
            if (friendSocketID) {
                io.to(friendSocketID).emit('userOnline', GoSipID)
            }
        })

        const onlineFriends = friends.filter((friendID) => onlineUsers.has(friendID))

        socket.emit('onlineFriendsList', onlineFriends)
    }) 

    socket.on('sendMessage', async ({ to, from, message, chatRoomID }) => {
        const newMessage = await Message.create({ chatRoomID, senderGoSipID: from, text: message, readBy: [from] })
        await ChatRoom.updateOne({ chatRoomID }, { updatedAt: new Date(Date.now()) })

        const receiverSocketId = onlineUsers.get(to)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('receiveMessage', { from, message, chatRoomID, createdAt: newMessage.createdAt })

            const unreadCount = await Message.countDocuments({ chatRoomID, readBy: { $ne: to } })

            io.to(receiverSocketId).emit('unreadCountUpdate', { chatRoomID, unreadCount })
        }

        socket.emit('messageSent', { message })
    })

    socket.on('markAsRead', async ({ chatRoomID, reader }) => {
        await Message.updateMany({ chatRoomID, readBy: { $ne: reader } }, { $addToSet: { readBy: reader } })

        io.emit('messagesRead', { chatRoomID, reader })

        const unreadCount = await Message.countDocuments({ chatRoomID, readBy: { $ne: reader } })

        const receiverSocketId = onlineUsers.get(reader)

        if (receiverSocketId) {
            io.to(receiverSocketId).emit('unreadCountUpdate', { chatRoomID, unreadCount })
        }
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