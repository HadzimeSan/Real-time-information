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

// Google OAuth (только если настроен)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL || 
    `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`;
  
  console.log('Google OAuth configured with callback:', googleCallbackURL);
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: googleCallbackURL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Google OAuth profile:', profile.id, profile.emails?.[0]?.value);
      const user = await findOrCreateOAuthUser('google', profile);
      console.log('Google OAuth user created/found:', user.id);
      done(null, user);
    } catch (error) {
      console.error('Google OAuth error:', error);
      done(error, null);
    }
  }));
} else {
  console.log('Google OAuth not configured (GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing)');
}

// GitHub OAuth (только если настроен)
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  const githubCallbackURL = process.env.GITHUB_CALLBACK_URL || 
    `${process.env.BASE_URL || 'http://localhost:3000'}/auth/github/callback`;
  
  console.log('GitHub OAuth configured with callback:', githubCallbackURL);
  
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: githubCallbackURL,
    scope: ['user:email'] // Запрашиваем доступ к email
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('GitHub OAuth callback received');
      console.log('Profile ID:', profile.id);
      console.log('Profile username:', profile.username);
      console.log('Profile displayName:', profile.displayName);
      console.log('Profile _json:', JSON.stringify(profile._json, null, 2));
      console.log('Profile emails:', profile.emails);
      console.log('Access token received:', accessToken ? 'yes' : 'no');
      
      const user = await findOrCreateOAuthUser('github', profile, accessToken);
      console.log('GitHub OAuth user created/found:', user.id, user.email, user.username);
      done(null, user);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      console.error('Error stack:', error.stack);
      done(error, null);
    }
  }));
} else {
  console.log('GitHub OAuth not configured (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET missing)');
}

// Facebook OAuth (только если настроен)
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  const facebookCallbackURL = process.env.FACEBOOK_CALLBACK_URL || 
    `${process.env.BASE_URL || 'http://localhost:3000'}/auth/facebook/callback`;
  
  console.log('Facebook OAuth configured with callback:', facebookCallbackURL);
  
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: facebookCallbackURL,
    profileFields: ['id', 'displayName', 'photos', 'email']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('Facebook OAuth profile:', profile.id, profile.displayName);
      const user = await findOrCreateOAuthUser('facebook', profile);
      console.log('Facebook OAuth user created/found:', user.id);
      done(null, user);
    } catch (error) {
      console.error('Facebook OAuth error:', error);
      done(error, null);
    }
  }));
} else {
  console.log('Facebook OAuth not configured (FACEBOOK_APP_ID or FACEBOOK_APP_SECRET missing)');
}

module.exports = passport;

