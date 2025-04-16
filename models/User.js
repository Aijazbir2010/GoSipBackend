import mongoose from "mongoose";

const COLORS = [
    "#FF5733", "#33FF57", "#3357FF", "#FF33A1", "#A133FF",
    "#FFD700", "#FF4500", "#32CD32", "#00CED1", "#8A2BE2",
    "#DC143C", "#20B2AA", "#FF8C00", "#9370DB", "#3CB371",
    "#7B68EE", "#ADFF2F", "#4682B4", "#FF69B4", "#BDB76B"
];
  
const generateGoSipID = () => {
    const randomHex = () => Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")
    return `GS-${randomHex().toUpperCase()}-${randomHex().toUpperCase()}`
}

const UserSchema = new mongoose.Schema({
    name: {type: String},
    GoSipID: {type: String, unique: true},
    email: {type: String, required: true, unique: true},
    password: {type: String},
    profilePic: {type: String, default: "https://res.cloudinary.com/df63mjue3/image/upload/v1742656391/GoSipDefaultProfilePic_ugv59u.jpg"},
    color: {type: String},
    friends: {type: [String], default: []},
    friendRequests: {type: [String], default: []},
    unreadNotifications: {type: Number, default: 0}
})

UserSchema.pre('save', async function (next) {
    if (!this.GoSipID) {
        let uniqueID = generateGoSipID()

        while (await mongoose.model('User').exists({GoSipID: uniqueID})) {
            uniqueID = generateGoSipID()
        }

        this.GoSipID = uniqueID
    }

    if (!this.color) {
        this.color = COLORS[Math.floor(Math.random() * COLORS.length)]
    }

    next()
})

const User = mongoose.models.User || mongoose.model('User', UserSchema)
export default User