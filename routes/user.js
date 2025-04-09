import { Router } from "express";
import dotenv from "dotenv";
import User from "../models/User.js";
import VerificationCode from "../models/VerificationCode.js";
import { verifyAuth } from "../middleware/verifyAuth.js";
import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const router = Router()

dotenv.config({ path: '.env.local' })

// For Uploading Profile Pic
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

// JWT (Json Web Token)
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
            secure: true,
            sameSite: 'none',
            maxAge: 15 * 60 * 1000
        })
    
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
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
            secure: true,
            sameSite: 'none',
            maxAge: 15 * 60 * 1000
        })

        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
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
        if (error) {
            return res.status(403).json({ error: 'Invalid Refresh Token !' })
        }

        const accessToken = generateAccessToken(decoded)

        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 15 * 60 * 1000
        })

        return res.json({ success: true })
    })
})

// Logout User
router.get('/logout', (_, res) => {

    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    })

    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    })

    return res.json({ success: true })
})

// Get User E-mail (For Sending E-mail To Reset Password)
router.post('/getemail', async (req, res) => {
    const { identifier } = req.body

    if (!identifier) {
        return res.status(400).json({ error: 'Identifier is required !' })
    }

    const user = await User.findOne({ $or: [{ email: identifier }, { GoSipID: identifier }] })

    if (!user) {
        return res.status(404).json({ message: 'No User Found !' })
    }

    const email = user.email

    return res.json({ email, success: true })
})

// Reset Password
router.post('/resetpassword', async (req, res) => {
    const { email, code, password } = req.body

    if (!email || !code || !password) {
        return res.status(400).json({ error: 'All fields are required !' })
    }

    try {

        const verificationCode = await VerificationCode.findOne({ email })
    
        if (!verificationCode) {
            return res.status(403).json({ error: 'Verification Code Expired !' })
        }
    
        if (verificationCode.code !== code.toUpperCase()) {
            return res.status(400).json({ error: 'Invalid Verification Code !' })
        }
    
        const hashedPassword = await bcrypt.hash(password, 10)
    
        await User.updateOne({ email }, { password: hashedPassword })

        return res.json({ success: true })
        
    } catch (error) {
        return res.status(500).json({ error: 'Cannot Reset Password ! Server Error !' })
    }

})

// Get User Data
router.get('/getuser', verifyAuth, async (req, res) => {
    const { GoSipID } = req.user

    const user = await User.findOne({ GoSipID })

    if (!user) {
        return res.status(404).json({ error: 'User Not Found !' })
    }

    return res.json({ user, success: true })
})

// Change User's Name
router.post('/changename', verifyAuth, async (req, res) => {
    const { GoSipID } = req.user
    const { name } = req.body

    const user = await User.findOne({ GoSipID })

    if (!user) {
        return res.status(404).json({ error: 'User Not Found !' })
    }

    const newUser = await User.findOneAndUpdate({ GoSipID }, { name }, { new: true })

    return res.json({ user: newUser, success: true })
})

// Update Profile Pic
router.post('/updateprofilepic', verifyAuth, upload.single('profilePic'), async (req, res) => {
    try {

        const newUser = await User.findOneAndUpdate({ GoSipID: req.user.GoSipID }, { profilePic: req.file.path }, { new: true })

        return res.json({ user: newUser, success: true })

    } catch (error) {
        console.log(error)
        return res.status(500).json({ error: 'Cannot Update Profile Pic ! Server Error !' })
    }
})

// Get Users For Adding As Friends
router.get('/getusers', verifyAuth, async (req, res) => {
    const query = req.query.identifier

    if (!query) {
        return res.status(400).json({ error: 'Query is required !' })
    }

    const users = await User.find({ $and: [{ $or: [{ name: { $regex: query, $options: 'i' } }, { GoSipID: { $regex: query, $options: 'i' }}] }, { GoSipID: { $ne: req.user.GoSipID } }] }) // $regex checks if the field contains the query and $options: 'i' make this search case-insensitive

    const usersData = users.map((user) => {
        return {
            name: user.name,
            GoSipID: user.GoSipID,
            profilePic: user.profilePic,
            inFriendRequests: user.friendRequests.includes(req.user.GoSipID)
        }
    })

    return res.json({ users: usersData })
})

// Get All The Information of Users In friendRequests array
router.get('/friendrequests', verifyAuth, async (req, res) => {
    const user = await User.findOne({ GoSipID: req.user.GoSipID })

    try {

        const users = await Promise.all(user.friendRequests.map(async (GoSipID) => {
            const user = await User.findOne({ GoSipID })
    
            return { name: user.name, GoSipID: user.GoSipID, profilePic: user.profilePic }
        }))
    
        return res.json({ users })
        
    } catch (error) {
        return res.status(500).json({ error: 'Cannot Get Friend Requests ! Server Error !' })
    }
})

// Reject Friend Request (Accept Friend Request Is In server.js)
router.post('/rejectrequest', verifyAuth, async (req, res) => {
    const { GoSipID } = req.body

    if (!GoSipID) {
        return res.status(400).json({ error: 'GoSipID is required !' })
    }

    await User.updateOne({ GoSipID: req.user.GoSipID }, { $pull: { friendRequests: GoSipID } })

    return res.json({ success: true })
})

export default router