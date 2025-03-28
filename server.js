import express from 'express'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import cors from 'cors'

import User from './models/User.js'

dotenv.config({ path: '.env.local' })

const app = express()

const MONGO_URI = process.env.MONGO_URI
const PORT = 3000

//Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())

mongoose.connect(MONGO_URI)

app.get('/', async (req, res) => {
    res.send('Hello World !')
})

app.listen(PORT, () => {
    console.log(`Server Listening On Port ${PORT}`)
})