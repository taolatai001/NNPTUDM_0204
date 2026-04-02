const express = require('express')
const mongoose = require('mongoose')
const router = express.Router()

const messageModel = require('../schemas/messages')
const userController = require('../controllers/users')
const { checkLogin } = require('../utils/authHandler')
const { MessageValidator, validatedResult } = require('../utils/validator')

router.use(checkLogin)

// GET /api/v1/messages
// lay message cuoi cung cua moi user ma user hien tai da nhan / gui
router.get('/', async function (req, res, next) {
    try {
        const currentUserId = new mongoose.Types.ObjectId(req.user._id)

        const messages = await messageModel.aggregate([
            {
                $match: {
                    $or: [
                        { from: currentUserId },
                        { to: currentUserId }
                    ]
                }
            },
            {
                $addFields: {
                    otherUser: {
                        $cond: [
                            { $eq: ['$from', currentUserId] },
                            '$to',
                            '$from'
                        ]
                    }
                }
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: '$otherUser',
                    lastMessage: { $first: '$$ROOT' }
                }
            },
            {
                $replaceRoot: {
                    newRoot: '$lastMessage'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'from',
                    foreignField: '_id',
                    as: 'from'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'to',
                    foreignField: '_id',
                    as: 'to'
                }
            },
            { $unwind: '$from' },
            { $unwind: '$to' },
            {
                $project: {
                    messageContent: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    from: {
                        _id: '$from._id',
                        username: '$from.username',
                        fullName: '$from.fullName',
                        avatarUrl: '$from.avatarUrl'
                    },
                    to: {
                        _id: '$to._id',
                        username: '$to.username',
                        fullName: '$to.fullName',
                        avatarUrl: '$to.avatarUrl'
                    }
                }
            },
            { $sort: { createdAt: -1 } }
        ])

        res.send(messages)
    } catch (error) {
        res.status(400).send({ message: error.message })
    }
})

// GET /api/v1/messages/:userID
// lay toan bo tin nhan giua user hien tai va userID
router.get('/:userID', async function (req, res, next) {
    try {
        const userID = req.params.userID

        if (!mongoose.Types.ObjectId.isValid(userID)) {
            return res.status(400).send({ message: 'userID khong hop le' })
        }

        const otherUser = await userController.FindUserById(userID)
        if (!otherUser) {
            return res.status(404).send({ message: 'userID khong ton tai' })
        }

        const messages = await messageModel.find({
            $or: [
                { from: req.user._id, to: userID },
                { from: userID, to: req.user._id }
            ]
        })
            .populate('from', 'username fullName avatarUrl email')
            .populate('to', 'username fullName avatarUrl email')
            .sort({ createdAt: 1 })

        res.send(messages)
    } catch (error) {
        res.status(400).send({ message: error.message })
    }
})

// POST /api/v1/messages/:userID
// gui tin nhan cho userID
router.post('/:userID', MessageValidator, validatedResult, async function (req, res, next) {
    try {
        const userID = req.params.userID

        if (!mongoose.Types.ObjectId.isValid(userID)) {
            return res.status(400).send({ message: 'userID khong hop le' })
        }

        const otherUser = await userController.FindUserById(userID)
        if (!otherUser) {
            return res.status(404).send({ message: 'userID khong ton tai' })
        }

        const newMessage = new messageModel({
            from: req.user._id,
            to: userID,
            messageContent: {
                type: req.body.messageContent.type,
                text: req.body.messageContent.text
            }
        })

        await newMessage.save()
        await newMessage.populate('from', 'username fullName avatarUrl email')
        await newMessage.populate('to', 'username fullName avatarUrl email')

        res.send(newMessage)
    } catch (error) {
        res.status(400).send({ message: error.message })
    }
})

module.exports = router