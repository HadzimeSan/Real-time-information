const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { findOrCreateOAuthUser } = require('./auth');

// Сериализация пользователя для сессии
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const authModule = require('./auth');
    const user = await authModule.getUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await findOrCreateOAuthUser('google', profile);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

// GitHub OAuth
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID || '',
  clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  callbackURL: process.env.GITHUB_CALLBACK_URL || '/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await findOrCreateOAuthUser('github', profile);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

// Facebook OAuth
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID || '',
  clientSecret: process.env.FACEBOOK_APP_SECRET || '',
  callbackURL: process.env.FACEBOOK_CALLBACK_URL || '/auth/facebook/callback',
  profileFields: ['id', 'displayName', 'photos', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await findOrCreateOAuthUser('facebook', profile);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
}));

module.exports = passport;

