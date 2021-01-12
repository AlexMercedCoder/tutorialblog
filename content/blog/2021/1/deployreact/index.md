---
title: Deploying React, Angular, Svelte and Vue to Netlify & Vercel
date: "2021-01-12T12:12:03.284Z"
description: Getting Your Project Online
---

## Creating Your Project

Doesn't matter if you use the official project generator for any of the major frontend frameworks or if you used other generators like my merced-spinup tool (check it out on npm), deploying the Vercel or Netlify is super simple!

## Info we need to collect

There are two things we need to figure out

- **The Build Command:** This is the command that triggers the build step

- **The Output Folder:** This is the folder the build command will leave the final website in.

Here are the commands for the main official templates for each framework.

| FrameWork | Build Command | Output Folder |
|-----------|---------------|---------------|
| *React | npm run build | build |
| Vue | npm run build | dist |
| Angular | npm run build | dist |
| Svelte | npm run build | public/build |

*For Created React App make sure to add "CI= " in front of the build script or it may error on netlify or vercel

#### For other templates

When using other templates look inside the package.json scripts to find the build command, and run it locally to see what folder the output is created in.

## Uploading your project to Github

The next step is to push your code to a repository on github, make sure that the root of your repository (the top level) is the directory where the package.json file exists other Netlify and Vercel will not be able to run the build command to deploy your project. The repo can be uploaded to github, bitbucket or gitlab.

## Connect the Repo

Log on to Vercel or Netlify and create a new project linked to your repository, when it asks for the build command and output directory enter the right entries and wait a moment for the website to build a voila! Your Site is deployed!

Not only that, the site will auto-update whenever you update your github repo, continuous deployment for the Win!

## Configuring for router

If your using client-side routing (React-Router, etc.) make sure to take these extra steps.

#### Netlify

In the root of your repository create a netlify.toml and add the following entries

netlify.toml
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
```


#### Vercel

On the root of your or repository create a vercel.json with the following

vercel.json
```json
{
  "version": 2,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/.*", "dest": "/index.html" }
  ]
}
```

## Bottom Line

Deploying your frontend application regardless of the framework on Vercel and Netlify is super easy, so go build some applications!