const express = require('express');
const axios = require('axios');
require('dotenv').config();
const port = process.env.PORT || 3000;
const session = require('express-session');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongodb-session')(session);
const apiKey = process.env.OPENAI_API_KEY;

const mongdbUri= process.env.MONGODB_URI;
const app = express();

const store = new MongoStore({ 
    uri: mongdbUri,
    collection: 'sessions'

});


mongoose.connect(mongdbUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Define User schema
const userSchema = new mongoose.Schema({
    name:{type:String,required:true,unique:true},
    email:{type:String,required:true,unique:true},
    password:{type:String,required:true},
    chatHistory: [{ role: String, content: String, timestamp: Date }]
});
const User = mongoose.model('User', userSchema);

let chats = [];

app.set('view engine', 'ejs');
app.use(express.static('./public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({ secret: 'this is a string', resave: false, saveUninitialized: true,store:store }));




// Middleware to check authentication status
const checkAuth = (req, res, next) => {
    console.log(req.session)
    if (req.session.user) {
        // User is authenticated
        req.session.isAuth = true;
    } else {
        // User is not authenticated
        req.session.isAuth = false;
    }
    console.log(req.session)

    next();
};




// Render the index page with the chat interface
app.get('/chatterBot', checkAuth, async (req, res) => {
    console.log(req.session)
    let username = ''; // Define username variable outside of if-else block
    if (req.session.isAuth) {
        console.log("the user id is", req.session.user)
        const existingUser = await User.findOne({ _id: req.session.user });
        console.log(existingUser.chatHistory)
        chats = existingUser.chatHistory;
        username = existingUser.name;

        // User is authenticated, render the chat interface
        res.render('chatterBot', { chats, isAuth: req.session.isAuth, username, year: new Date().getFullYear() });
    } else {
        // User is not authenticated, redirect to login page
        res.render('chatterBot', { chats, isAuth: false, username, year: new Date().getFullYear() });
    }
});



// Render login page
app.get('/login', (req, res) => {
    res.render('login');
});





// Handle user login
app.post('/login-post', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user exists in the database
        const user = await User.findOne({ email });
        console.log(user)
        if (!user) {
            return res.status(400).send('Invalid email or password');
        }
        
        // Check if the password is correct
        if (user.password !== password) {
            return res.status(400).send('Invalid email or password');
        }
        
        // Set up session for the logged-in user
        req.session.user = user._id;
        console.log('user logged in successfully');
        console.log("from login function ",req.session)

        // Redirect to the chat interface
        res.redirect('/chatterBot');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing request');
    }
});




// Render signup page
app.get('/signup', (req, res) => {
    res.render('signup');
});




// Handle user registration
app.post('/signup-post', async (req, res) => {
    try {
        console.log(req.body)
        const { username, email, password } = req.body;
        
        // Check if user with the same email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send('User with this email already exists');
        }
        
        // Create a new user and save to the database
        const newUser = new User({ name:username, email:email, password:password, chatHistory: [] });
        await newUser.save();
        console.log('user created successfully');
        
        // Generate a session for the new user
        req.session.user = newUser._id;
        console.log("signup fucntion",req.session)
        
        // Redirect to the chat interface
        res.redirect('/chatterBot');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing request');
    }
});






// reset chat history
app.post('/reset', async (req, res) => {
    try {
        const existingUser = await User.findOne({ _id: req.session.user });
        existingUser.chatHistory = [];
        await existingUser.save();
        chats = existingUser.chatHistory;
        res.redirect('/chatterBot');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing request');
    }
});


// pixelBloom
app.get('/pixelBloom', (req, res) => {
    res.render('pixelBoom',{isAuth: req.session.isAuth,year: new Date().getFullYear()});
});

// soundCraft
app.get('/soundCraft', (req, res) => {
    res.render('soundCraft',{isAuth: req.session.isAuth,year: new Date().getFullYear()});
});

// help
app.get('/help', (req, res) => {
    res.render('help',{isAuth: req.session.isAuth,year: new Date().getFullYear()});
});

// profile 
app.get('/profile', async (req, res) => {
    const existingUser = await User.findOne({ _id: req.session.user });
    res.render('profile',{user:existingUser,isAuth: req.session.isAuth,year: new Date().getFullYear()});

});

// update profile
app.post('/updateProfile', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const existing = await User.findOne({ _id: req.session.user });
        existing.name = name;
        existing.email = email;
        existing.password = password;
        await existing.save();
        res.redirect('/profile');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing request');
    }
});



// Handle user input and send request to OpenAI API
app.post('/sendMessage', async (req, res) => {
    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: req.body.message }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        // Push user message and bot response to chat history
        // console.log("this is mess",req.session)
        const existingUser = await User.findOne({ _id: req.session.user });
        console.log(existingUser)
        existingUser.chatHistory.push({ role: 'user', content: req.body.message });
        existingUser.chatHistory.push({ role: 'bot', content: response.data.choices[0].message.content });
        await existingUser.save();
        console.log('Message sent successfully');
        chats = existingUser.chatHistory;
        // Send the updated chat history back to the client
        res.json({chats});
    } catch (error) {
        console.error(error);
        res.status(500).send('Error processing request');
    }
});

// 404: Not Found
app.use((req, res) => {
    res.status(404).render('404', { year: new Date().getFullYear() });
});
// Handle user logout
app.post('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
