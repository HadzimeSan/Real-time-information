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
      console.log('GitHub OAuth profile received:', {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        profileUrl: profile.profileUrl
      });
      
      // GitHub может не предоставить email в profile, нужно запросить через API
      let email = null;
      if (profile.emails && profile.emails.length > 0) {
        // Проверяем основной email (первый, который не помечен как primary=false)
        const primaryEmail = profile.emails.find(e => e.primary !== false);
        email = primaryEmail ? (primaryEmail.value || primaryEmail) : profile.emails[0].value || profile.emails[0];
      }
      
      // Если email не найден в profile, запрашиваем через GitHub API
      if (!email && accessToken) {
        try {
          const https = require('https');
          const emailData = await new Promise((resolve, reject) => {
            const req = https.get({
              hostname: 'api.github.com',
              path: '/user/emails',
              headers: {
                'User-Agent': 'ChatApp-OAuth',
                'Authorization': `token ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            }, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                if (res.statusCode === 200) {
                  try {
                    resolve(JSON.parse(data));
                  } catch (e) {
                    reject(new Error('Failed to parse GitHub API response'));
                  }
                } else {
                  reject(new Error(`GitHub API returned status ${res.statusCode}`));
                }
              });
            });
            req.on('error', reject);
            req.setTimeout(5000, () => {
              req.destroy();
              reject(new Error('GitHub API request timeout'));
            });
          });
          
          // Находим primary email или берем первый verified
          if (Array.isArray(emailData) && emailData.length > 0) {
            const primaryEmail = emailData.find(e => e.primary === true);
            const verifiedEmail = emailData.find(e => e.verified === true && !e.primary);
            email = primaryEmail ? primaryEmail.email : (verifiedEmail ? verifiedEmail.email : emailData[0].email);
          }
          
          console.log('GitHub email fetched from API:', email);
        } catch (apiError) {
          console.warn('Failed to fetch email from GitHub API:', apiError.message);
          // Продолжаем без email - будет создан временный
        }
      }
      
      // Добавляем email в profile если получили через API
      if (email && (!profile.emails || profile.emails.length === 0)) {
        profile.emails = [{ value: email, primary: true }];
      }
      
      // Улучшаем структуру profile для findOrCreateOAuthUser
      if (!profile._json) {
        profile._json = {};
      }
      if (email && !profile._json.email) {
        profile._json.email = email;
      }
      if (profile.username && !profile._json.login) {
        profile._json.login = profile.username;
      }
      if (!profile._json.avatar_url && profile.photos && profile.photos[0]) {
        profile._json.avatar_url = profile.photos[0].value;
      }
      
      console.log('Processing GitHub profile with email:', email || 'no email (will generate temporary)');
      
      const user = await findOrCreateOAuthUser('github', profile, accessToken);
      console.log('GitHub OAuth user created/found:', {
        id: user.id,
        username: user.username,
        email: user.email
      });
      done(null, user);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
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

