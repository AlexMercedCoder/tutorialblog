---
title: The Guide to How to Implement Authorization in any language and framework
date: "2021-11-18T12:12:03.284Z"
description: Having Users Login
---
![Title Image](https://i.imgur.com/XbV0EzX.jpg)

If your not familiar with the concept of Authentication and Authorization, I recommend first reading this article:

[Authentication and Authorization in Concept](https://tuts.alexmercedcoder.com/2020/AuthConcept/)

Also here are a few convieniet how tos:

[Basic Auth with JWT & Mongo](https://tuts.alexmercedcoder.com/2021/8/basic_auth_express_mongo/)
[JWT Auth using Ruby on Rails](https://tuts.alexmercedcoder.com/2020/ruby-tut/)

## Implementing Authentication from the Backend

It doesn't really matter what language or framework you are using, when building the backend your dealing with routing so what matters is you have routes that do the things that needs to be done.

### User Model

Regardless what database your using you'll need a User model to save user data in a collection or table. Here are the two must-have properties.

- id/_id: the primary key
- username: String/Unique/Required
- password: String/Required

Other useful properties:

- email (this should also be unique)
- role (especially if your doing role based access)

Since id, username, and possibly email should all be unique fields, these are great fields to use as a foreign key on any related tables/collections. (for example, a Photo model whose schema has a user property which contains the id/username/email of the owner of the photo)

### Signup Route (/signup, /auth/new, etc.)

The url itself doesn't matter so much as what this route should do.

- should be a post route
- it will receive data in the request body either from a form (urlencoded) or via JSON (json), so make sure to have the proper body parsers in place.
- using a library like bcrypt which should be available in most languages, you should encrypt the password string
- create a new user using the data received (except using the encrypted version of the password)

### Login Route (/login, /auth/signin, etc.)

- this should be a post route
- first it should check if the user exists, send error message if not (with 401 unauthorized status code ideally)
- if user does exist, use bcrypt to compare password string to encrypted password string from database, if not a match, send error message (401)
- if password matches then login is successful

The next part depends on chosen path for Authorization

#### Session Based Auth

- assuming session cookies are configred in your framework
- store any data you want accessible (username, etc.) while they are logged in
- create middleware for protected routes that will check for data in sessions and kick user back to signup or login page if not present

#### JWT Authentication

- create an object/dictionary/hash with any data you want stored (username) and then use your languages JWT library to sign a token with a secret key (a string, can be anything, ideally hard to guess).

- You can either send the token in the body of the login response or via a cookie

    - If the token is sent to the body then the frontend application is responsible for figuring out how to securely store it... which can be tricky. (local/session storage can be subject to attacks, using [refresh tokens](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/) to get a fresh token on refresh can be tedious to implement). Also, the frontend now has to make sure to transmit the token on all future requests explicitly (usually via a request header).

    - If the token is sent via a cookie, it should be an [http-only cookie](https://www.youtube.com/watch?v=c_f2o5dZl8A) (look up how to do cookies in your framework). This is more secure and the cookie will automatically will be sent with subsequent requests so the frontend application doesn't have to worry about sending it with future requests explicitly.

### Logout

- If using sessions, you just need a route that will destory the session when requested

- If using JWT tokens, you just need to dispose of the token on logout which means destroying any variables, local/session storage data or cookies the token is stored in.

Either way you should redirect the user to a non-protected page like the login page after doing so.

- redirects for a multiple page application can be handled using your server side routes

- redirect for a single page application should be done using your frontend routing library

#### Authentication Middleware

You'll need middleware to check if a user is logged in, essentially the logic of this middleware should do the following:

- if using session based auth, check if the user is logged in based on the data in sessions (like if the username is there, probably loggedIn). If data not stored redirect to login page and/or send a 401 unauthorized response.

- if using JWT based auth, check the expected transmission mechanism for the token (headers, body, query, params, cookies) then using the JWT library verify the token with the secret key. If verification fails, send back a 401 status unauthorized response.

- Either way, if the user is logged in you'll have data from session or from the decoded JWT, take that data and store it somewhere your routes can have access to it like in the request object or as a static properties of any class based controllers your routes are using (think Rails/Laravel/Masonite). This makes the data available to routes can query resources based on the user and make sure to put the users credentials on any new resources created.

## Implementing Authentication on the Frontend

If your creating a multiple page application that uses a template engine, then there isn't much you have to do since each route will have handled everything before rendering any templates.

If your creating a single page application, this gets a bit more complicated.

- as far making parts of the page and links visible, this can be done by conditionally checking whether a token is available (if using an http only cookie then instead make a "loggedIn" variable and set it to true and use that to conditionally render any links or content)

- if token not sent via  cookie then you need to make sure to include the token in the way your backend was setup to handle (depends on how you setup the authentication middleware, most likely a header).

- make sure to use your frontend routing library to redirect users when they login and logout

- The token will be needed for all protected request so you'll probably want to use some state management solution to make the token accessible throughout your app

    - context/recoil/redux for react
    - vuex for vue
    - svelte has a context feature built in
    - a service for angular

## GraphQL Considerations

If creating a GraphQL API, essentially the logic is the same but instead of different post routes, you login and signup routes would be mutations.

## Third Party Auth Providers

Auth Providers allow you to offload a lot of the security concerns and let users login with existing account with a provider like facebook or github. Although, keep in mind, these providers do make the user experience a better one but they can be just as complicated if not more so than implmenting your own authentication a lot of the time.

Essentially the way these work is when a user logs in your redirect them away from your page to a login with the auth provider. When complete the auth provider redirect the user to a URL of your choice passing along some user meta data which can then use tag things you store in your own database to track resource ownership.

- [OAuth Standard](https://oauth.net/)
- [Auth0](https://auth0.com/)
- [Okta](https://www.okta.com/)
- [AWS Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html)
- [Netlify Identity](https://docs.netlify.com/visitor-access/identity/)
- [Passport - For using Auth Providers with Nodejs](http://www.passportjs.org/)

## Conclusion

These principles should serve helpful in thinking through the implementation of authentication in any language or framework as the pattern doesn't really change. Use some google-fu to help find the tech specific methods of doing the above and you'll find yourself a more versatile developer.