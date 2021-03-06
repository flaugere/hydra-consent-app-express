const express = require('express')
const Hydra = require('ory-hydra-sdk')
const router = express.Router()
const OAuth2 = require('simple-oauth2')
const qs = require('querystring')
const process = require('process')
const users = require('../mock/users')

const scope = 'hydra.consent'
const oauth2 = OAuth2.create({
  client: {
    id: qs.escape(process.env.HYDRA_CLIENT_ID),
    secret: qs.escape(process.env.HYDRA_CLIENT_SECRET)
  },
  auth: {
    tokenHost: endpoint = process.env.HYDRA_URL,
    authorizePath: authorizePath = '/oauth2/auth',
    tokenPath: tokenPath = '/oauth2/token'
  },
  options: {
    useBodyAuth: false,
    useBasicAuthorizationHeader: true
  }
})

// Instantiating a hydra config. If you provide no config, the hydra-js library will try to figure them out
// from the environment variables, such as HYDRA_CLIENT_ID, HYDRA_CLIENT_SECRET, and HYDRA_URL.

Hydra.ApiClient.instance.basePath = process.env.HYDRA_URL

const hydra = new Hydra.OAuth2Api()

const refreshToken = () => oauth2.clientCredentials
  .getToken({ scope })
  .then((result) => {
    const token = oauth2.accessToken.create(result);
    const hydraClient = Hydra.ApiClient.instance
    hydraClient.authentications.oauth2.accessToken = token.token.access_token
    return Promise.resolve(token)
  })

refreshToken().then().catch((err) => {
  console.error('Unable to refresh token, an error occurred: ', err)
  process.exit(1)
})

// A simple error helper
const catcher = (w) => (error) => {
  console.error(error)
  w.render('error', { error })
  w.status(500)
  return Promise.reject(error)
}

const resolver = (resolve, reject) => (error, data, response) => {
  if (error) {
    return reject(error)
  } else if (response.statusCode < 200 || response.statusCode >= 400) {
    return reject(new Error('Consent endpoint gave status code ' + response.statusCode + ', but status code 200 was expected.'))
  }

  resolve(data)
}

// This get's executed when we want to tell hydra that the user is authenticated and that he authorized the application
const resolveConsent = (r, w, consent, grantScopes = []) => {
  const { email, email_verified, user_id: subject, name, nickname, login } = r.session.user
  const idTokenExtra = {}

  // Sometimes the body parser doesn't return an array, so let's fix that.
  if (!Array.isArray(grantScopes)) {
    grantScopes = [grantScopes]
  }

  // This is the openid 'profile' scope which should include some user profile data. (optional)
  if (grantScopes.indexOf('profile') >= 0) {
    idTokenExtra.name = name
    idTokenExtra.nickname = nickname
    idTokenExtra.login = login
  }

  // This is to fulfill the openid 'email' scope which returns the user's email address. (optional)
  if (grantScopes.indexOf('email') >= 0) {
    idTokenExtra.email = email
    idTokenExtra.email_verified = email_verified
  }

  refreshToken().then(() => {
    // Do not return this directly, otherwise `then()` will be called, causing superagent to fail with the double
    // callback bug.
    hydra.getOAuth2ConsentRequest(r.query.consent,
      resolver(
        (consentRequest) => hydra.acceptOAuth2ConsentRequest(r.query.consent, {
            subject,
            grantScopes,
            idTokenExtra,
            accessTokenExtra: {}
          },
          resolver(() => w.redirect(consentRequest.redirectUrl), catcher(w))
        ),
        catcher(w)
      )
    )
  })
}

router.get('/consent', (r, w) => {
  // This endpoint is hit when hydra initiates the consent flow
  if (r.query.error) {
    // An error occurred (at hydra)
    return w.render('error', { error: { name: r.query.error, message: r.query.error_description } })
  }

  if (!r.session.isAuthenticated) {
    // The user is not authenticated yet, so redirect him to the log in page
    return w.redirect('/login?error=Please+log+in&consent=' + r.query.consent)
  }

  refreshToken().then(() => {
    // Do not return this directly, otherwise `then()` will be called, causing superagent to fail with the double
    // callback bug.
    hydra.getOAuth2ConsentRequest(r.query.consent, resolver((consentRequest) => {
      // consentRequest contains informations such as requested scopes, client id, ...

      // Here you could, for example, allow clients to force a user's consent. Since you're able to
      // say which scopes a client can request in hydra, you could allow this for a few highly priviledged clients!
      //
      // if (consentRequest.scp.find((s) => s === 'force-consent')) {
      //   resolveConsent(r, w, r.query.consent, consentRequest.requestedScopes)
      //   return Promise.resolve()
      // }

      // render the consent screen
      w.render('consent', { scopes: consentRequest.requestedScopes })

    }, catcher(w)))
  })
})

router.post('/consent', (r, w) => {
  if (!r.session.isAuthenticated) {
    return w.redirect('/login?error=Please+log+in&consent=' + r.body.consent)
  }

  resolveConsent(r, w, r.query.consent, r.body.allowed_scopes)
})

router.get('/login', (r, w) => {
  w.render('login', { error: r.query.error, consent: r.query.consent })
})

router.post('/login', (r, w) => {
  const form = r.body
  users.forEach((user) => {
    if (form.email == user.email && form.password == user.password) {
      r.session.user = user;
      r.session.isAuthenticated = true
      w.redirect('/consent?consent=' + r.body.consent)  
    }
  });
  w.redirect('/login?error=Wrong+credentials+provided&consent=' + form.consent)
})

router.get('/logout', (r, w) => {
  r.session.destroy()
  w.redirect(r.query.post_logout_redirect_uri)
})

router.get('/', (
  r,
  w
) => w.send('This is an exemplary consent app for Hydra. Please read the hydra docs on how to use this router.'))

module.exports = router
