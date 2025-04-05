import express from 'express'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import UserRouter from './routes/user.js'
import VerificationCodeRouter from './routes/verificationcode.js'
import ChatRouter from './routes/chat.js'

dotenv.config({ path: '.env.local' })

const app = express()

const MONGO_URI = process.env.MONGO_URI
const PORT = 3000

//Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(cookieParser())
app.use('/user', UserRouter)
app.use('/verificationcode', VerificationCodeRouter)
app.use('/chats', ChatRouter)

mongoose.connect(MONGO_URI)

app.listen(PORT, () => {
    console.log(`Server Listening On Port ${PORT}`)
})