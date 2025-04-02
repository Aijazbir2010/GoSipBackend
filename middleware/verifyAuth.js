import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

export const verifyAuth = (req, res, next) => {
    const { accessToken } = req.cookies

    if (!accessToken) {
        return res.status(401).json({ error: 'Unauthorized !' })
    }

    jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET, (error, decoded) => {
        if (error) {
            return res.status(403).json({ error: 'Invalid Token !' })
        }

        req.user = decoded

        next()
    })
}