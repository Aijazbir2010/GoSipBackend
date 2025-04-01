import { Router } from "express";
import dotenv from 'dotenv'
import User from "../models/User.js";
import VerificationCode from "../models/VerificationCode.js";
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import req from "express/lib/request.js";

const router = Router()

dotenv.config({ path: '.env.local' })

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET

const generateAccessToken = (user) => {
    return jwt.sign({GoSipID: user.GoSipID, email: user.email}, JWT_ACCESS_SECRET, { expiresIn: '15m' })
}

const generateRefreshToken = (user) => {
    return jwt.sign({GoSipID: user.GoSipID, email: user.email}, JWT_REFRESH_SECRET, { expiresIn: '7d' })
}

// Register User
router.post('/register', async (req, res) => {
    const { name, email, password, code } = req.body

    if (!name || !email || !password || !code) {
        return res.status(400).json({ error: 'All fields are required !' })
    }

    try {

        const verificationCode = await VerificationCode.findOne({ email })
    
        if (!verificationCode) {
            return res.status(401).json({ error: 'Verification Code Expired !' })
        }
    
        if (code.toUpperCase() !== verificationCode.code) {
            return res.status().json({ error: 'Invalid Verification Code !' })
        }
    
        const existingUser = await User.findOne({ email })
    
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists with this E-mail !' })
        }
    
        const hashedPassword = await bcrypt.hash(password, 10)
    
        const newUser = await User.create({ name, email, password: hashedPassword })
    
        const accessToken = generateAccessToken(newUser)
        const refreshToken = generateRefreshToken(newUser)
    
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        })
    
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        })
    
        return res.json({ success: true })

    } catch (error) {
        return res.status(500).json({ error: 'Unable to Register User ! Server Error !' })
    }

})

// Login User
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body

    if (!identifier || !password) {
        return res.status(400).json({ error: 'All fields are required !' })
    }

    try {
        const user = await User.findOne({ $or: [{ email: identifier }, { GoSipID: identifier }] })

        if (!user) {
            return res.status(401).json({ error: 'No Account Exists With This E-mail or GoSipID !' })
        }

        if (!(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid Password !' })
        }

        const accessToken = generateAccessToken(user)
        const refreshToken = generateRefreshToken(user)

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        })

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        })

        return res.json({ success: true })

    } catch (error) {
        return res.status(500).json({error: 'Unable to Login User ! Server Error !' })
    }
})

// Refresh Access Token
router.get('/refresh', (req, res) => {
    const { refreshToken } = req.cookies

    if (!refreshToken) {
        return res.status(401).json({ error: 'Refresh Token Missing !' })
    }

    jwt.verify(refreshToken, JWT_REFRESH_SECRET, (error, decoded) => {
        if (!error) {
            return res.status(403).json({ error: 'Invalid Refresh Token !' })
        }

        const accessToken = generateAccessToken(decoded)

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: 'strict',
            maxAge: 15 * 60 * 1000
        })

        return res.json({ success: true })
    })
})

// Logout User
router.get('/logout', (req, res) => {

    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict'
    })

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict'
    })

    return res.json({ success: true })
})

export default router