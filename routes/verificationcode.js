import { Router } from "express";
import VerificationCode from "../models/VerificationCode.js";
import nodemailer from 'nodemailer'

const router = Router()

const generateCode = () => {
    return Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0').toUpperCase()
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    secure: true,
    port: 465,
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    }
})

// Send Verification Code
router.post('/send', async (req, res) => {
    const { email } = req.body

    if (!email) {
        return res.status(400).json({ error: 'E-mail is required !' })
    }

    const code = generateCode()

    try {
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Verification Code',
            html: `<!DOCTYPE html>
<html>

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PokéSphere - Verification Code</title>
</head>

<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #FFFFFF;">
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
        style="background-color: #FFFFFF; padding: 250px 10px;">
        <tr>
            <td align="center">
                <!-- Main Card Container -->
                <table border="0" cellpadding="0" cellspacing="0" width="700"
                    style="background-color: #F3F4F4; border-radius: 24px; overflow: hidden;">

                    <tr>
                        <td align="center" style="padding: 40px 20px 20px;">
                            <table border="0" cellpadding="0" cellspacing="0"
                                style="width: auto; display: inline-table;">
                                <tr>
                                    <!-- Logo Column -->
                                    <td style="padding-right: 10px; vertical-align: middle;">
                                        <img src="https://res.cloudinary.com/df63mjue3/image/upload/v1743417380/hxgu6qbgn7rmzhpecqa3.png" alt="PokéSphere Logo"
                                            style="width: 50px; height: 50px;">
                                    </td>
                                    <!-- Text Column -->
                                    <td style="vertical-align: middle;">
                                        <h1 style="margin: 0; color: #4BB3FD; font-size: 40px; font-weight: bold;">
                                            GoSip
                                        </h1>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 20px 0 10px;">
                            <h2 style="margin: 0; color: #1B2021; font-size: 36px;">You're Almost There !</h2>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 0 30px;">
                            <p
                                style="color: #1B2021; font-size: 14px; line-height: 1.5; margin: 0 0 30px; text-align: center;">
                                Only one step left to become a Member of GoSip. Please enter this verification code
                                in the register form.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 0 30px 10px;">
                            <p
                                style="color: #4BB3FD; font-size: 60px; font-weight: bold; margin: 0; letter-spacing: 2px;">
                                ${code}
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center">
                            <p style="color: #1B2021;margin: 0;">
                                This code expires in 5 minutes.
                            </p>
                        </td>
                    </tr>

                    <tr>
                        <td align="center" style="padding: 60px 30px 20px;">
                            <p style="color: #1B2021; font-size: 12px; margin: 0;">
                                &copy; GoSip ${new Date().getFullYear()} All Rights Reserved.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>

            </html>`,
        };

        await transporter.sendMail(mailOptions)

        const existingCode = await VerificationCode.findOne({ email })

        if (existingCode) {
            await VerificationCode.updateOne({ email }, { code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) })
        } else {
            await VerificationCode.create({code, email, expiresAt: new Date(Date.now() + 5 * 60 * 1000)})
        }

        return res.json({ success: true })

    } catch (error) {
        return res.status(500).json({ error: 'Unable to Send Verification Code ! Server Error !' })
    }
})

export default router