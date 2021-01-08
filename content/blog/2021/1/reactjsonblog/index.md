---
title: React 101 - Basic JSON Blog from 0 to deployment
date: "2021-01-08T12:12:03.284Z"
description: A Simple Build to Learn React
---

## Our Goal

In this tutorial, you will create a simple blog from a JSON file using React. In doing so we will use state and props to create a simple 3 component application.

## 1 - Generate our App

- In a folder that is not a git repo run the command `npx create-react-app blogjson`

- cd in into the blogjson folder and run `npm start` to get the dev server running

## 2 - Create JSON blog data

There is a lot of ways to serve this information, but using JSON would probably be the simplest way.

- In the src folder create a file called posts.json with the following content:

```json
[
    {
        "title": "Blog Post 1",
        "date": "1-7-2021",
        "body": "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque nisl eros, pulvinar facilisis justo mollis, auctor consequat urna. Morbi a bibendum metus. Donec scelerisque sollicitudin enim eu venenatis. Duis tincidunt laoreet ex, in pretium orci vestibulum eget. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Duis pharetra luctus lacus ut vestibulum. Maecenas ipsum lacus, lacinia quis posuere ut, pulvinar vitae dolor. Integer eu nibh at nisi ullamcorper sagittis id vel leo. Integer feugiat faucibus libero, at maximus nisl suscipit posuere. Morbi nec enim nunc. Phasellus bibendum turpis ut ipsum egestas, sed sollicitudin elit convallis. Cras pharetra mi tristique sapien vestibulum lobortis. Nam eget bibendum metus, non dictum mauris. Nulla at tellus sagittis, viverra est a, bibendum metus."
    },
    {
        "title": "Blog Post 2",
        "date": "1-7-2021",
        "body": "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque nisl eros, pulvinar facilisis justo mollis, auctor consequat urna. Morbi a bibendum metus. Donec scelerisque sollicitudin enim eu venenatis. Duis tincidunt laoreet ex, in pretium orci vestibulum eget. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Duis pharetra luctus lacus ut vestibulum. Maecenas ipsum lacus, lacinia quis posuere ut, pulvinar vitae dolor. Integer eu nibh at nisi ullamcorper sagittis id vel leo. Integer feugiat faucibus libero, at maximus nisl suscipit posuere. Morbi nec enim nunc. Phasellus bibendum turpis ut ipsum egestas, sed sollicitudin elit convallis. Cras pharetra mi tristique sapien vestibulum lobortis. Nam eget bibendum metus, non dictum mauris. Nulla at tellus sagittis, viverra est a, bibendum metus."
    },
    {
        "title": "Blog Post 3",
        "date": "1-7-2021",
        "body": "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque nisl eros, pulvinar facilisis justo mollis, auctor consequat urna. Morbi a bibendum metus. Donec scelerisque sollicitudin enim eu venenatis. Duis tincidunt laoreet ex, in pretium orci vestibulum eget. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Duis pharetra luctus lacus ut vestibulum. Maecenas ipsum lacus, lacinia quis posuere ut, pulvinar vitae dolor. Integer eu nibh at nisi ullamcorper sagittis id vel leo. Integer feugiat faucibus libero, at maximus nisl suscipit posuere. Morbi nec enim nunc. Phasellus bibendum turpis ut ipsum egestas, sed sollicitudin elit convallis. Cras pharetra mi tristique sapien vestibulum lobortis. Nam eget bibendum metus, non dictum mauris. Nulla at tellus sagittis, viverra est a, bibendum metus."
    }
]

```

**NOTE** While it looks like an array of javascript objects, notice the JSON file extension and that all the keys are also in quotations, this is JSON syntax.

## 3 - Our Components

We will have two components, posts, and post. Posts will list all the posts and can be clicked to help generate which post will be displayed by the post component.

- in the src folder create a folder called components

- create two files called Posts.js and Post.js

Post.js

```js
import React from "react"

const Post = (props) => {
    return <h1>Post Component</h1>
}

export default Post
```

Posts.js
```js
import React from "react"

const Posts = (props) => {
    return <h1>Posts Component</h1>
}

export default Posts

```

Now let's import them into src/App.js

```js

import Post from "./components/Post";
import Posts from "./components/Posts";
import Blog from "./posts.json"
import "./App.css";

function App() {

  //See Our Blog Posts in Console
  console.log(Blog)

  return (
    <div className="App">
      <h1>My Blog</h1>
      <Posts />
      <Post />
    </div>
  );
}

export default App;

```

You currently should see:
- You post and posts component
- The Blog json data in the console

## 4 - Building Out Posts

Our post App will list all the different posts by title and date. The data for all the posts exists in App.js, so App should pass the data as a prop (props are data passed to a component from its parent, syntactically passed as an HTML attribute).

App.js
```js
import Post from "./components/Post";
import Posts from "./components/Posts";
import Blog from "./posts.json"
import "./App.css";

function App() {

  //See Our Blog Posts in Console
  console.log(Blog)

  return (
    <div className="App">
      <h1>My Blog</h1>
      <Posts posts={Blog}/>
      <Post />
    </div>
  );
}

export default App;
```

Now that we passed down the Blog data from app to Posts as a prop called posts, let's use that data in the Posts component. We will use the map array method to loop over the data and generate JSX for each post then inject the array of JSX into the JSX that is returned by the Posts component.

Posts.js
```js
import React from "react";

const Posts = (props) => {
  //creating an array of JSX for each post, using the map array method
  const postsJSX = props.posts.map((post, index) => (
    <div className="summary">
      <h1>{post.title}</h1>
      <p>{post.date}</p>
    </div>
  ));

  return <div className="posts">{postsJSX}</div>;
};

export default Posts;
```

You should now see the blog posts being rendered to the screen. We'd like the user to be able to select which posts are highlighted by the Post component. Only App can pass this data to Posts since App is the parent of Posts, so the state that tracks the post to be displayed should exist in App.

- We will create a "post" state
- We will give it an initial value of the first post
- We will create a function that can be passed a different post and change the state
- We Will pass that function to Post so it can use it

App.js
```js

import Post from "./components/Post";
import Posts from "./components/Posts";
import Blog from "./posts.json"
import "./App.css";
import React from "react"

function App() {

  //Post to track the post displayed by Post
  const [post, setPost] = React.useState(Blog[0])

  //Function to change the displayed post
  const selectPost = (selected) => {
    setPost(selected)
  }

  return (
    <div className="App">
      <h1>My Blog</h1>
      <Posts posts={Blog} select={selectPost}/>
      <Post post={post}/>
    </div>
  );
}

export default App;

```

So now if you examine using the React DevTools Chrome Extension you should be able to view the following:

- The state exists in the App component
- The two props being passed to the Posts component
- The single prop being passed to the Post component

Now we will revisit the Posts component to use the selectPost function which was passed down as a prop called select. We will use it in our map logic so when you click on that post's div it passes that post to the function.

Posts.js
```js
import React from "react";

const Posts = (props) => {
  //creating an array of JSX for each post, using the map array method
  const postsJSX = props.posts.map((post, index) => (
    <div className="summary" onClick={() => props.select(post)}>
      <h1>{post.title}</h1>
      <p>{post.date}</p>
    </div>
  ));

  return <div className="posts">{postsJSX}</div>;
};

export default Posts;
```

Now click on the different posts and you should see the state change in the app component which will also change the prop in the Post component (when the state that exists in App is changed, App is rebuilt along with its children passing them the updated props).

## 5 - Building out Post

So we can see in the React DevTools that Post is receiving a single post, so let's render that post.


Post.js
```js
import React from "react";

const Post = (props) => {
  return (
    <div className="post">
      <h1>{props.post.body}</h1>
      <h3>{props.post.date}</h3>
      <p>{props.post.body}</p>
    </div>
  );
};

export default Post;

```

So now you should be able to see the three posts and one of them in full detail. You should be able to click on the other post summaries and see the detailed post-change!

## Some basic styling

Let's add some basic styling to the index.css to make this more presentable!

index.css
```css
.App {
  display: grid;
  grid-template-areas: 
  "title title title title"
  "posts post post post"
  "posts post post post"
  "posts post post post";
  width: 90%;
  margin: 10px auto;
}

.App > h1 {
  grid-area: title;
  background-color: navy;
  color: white;
  padding: 5px;
  margin: 10px auto;
  width: 100%;

}

.posts {
  grid-area: posts;
  border: 2px solid navy;
  padding: 5px;
}

.posts > div {
  background-color: crimson;
  color: white;
  padding: 5px;
  margin: 2px;
}

.post {
  grid-area: post;
  padding: 10px;
}
```

While not very pretty, you probably can see more clearly what is going on. Feel free to make it as pretty as you want and update the JSON file with real blog posts.

## Deployment

If you'd like to deploy this on the web this can be done very easily with netlify by creating a free netlify account and following these steps.

- commit your code and push to either github, bitbucket or gitlab

- logon to netlify and click create new site from git

- connect your github, gitlab or bitbucket account

- select the repository with your react app

- it should automatically detect the build command and publish director but if not for create-react-app its...

build command: npm run build

publish director: build

- submit and your website will be live and ready in a moment and automatically update whenever you update your github repo!