---
title: Ultimate 2021 Guide to Deploying NodeJS (And DenoJS) Apps to Heroku
date: "2021-04-01T12:12:03.284Z"
description: Heroku CLI, Continuous Integration and more
---

Heroku is a great platform for deploying full-stack applications (if your application is frontend-only then Netlify, Vercel or Render may be a better alternative). In this guide, I will be focusing on the different ways to deploy a node js app. If you are using DenoJS I'll link a video below on deploying a Deno app.

- [Using Docker to Deploy DenoJS](https://www.youtube.com/watch?v=Fe4XdAiqaxI)

For today's discussion, we will cover two ways to deploy to Heroku.

| Method | Pros | Cons |
|--------|------|------|
| Connecting a Git Repo | Continuous Integration, Only Push to One Repo | Have to use --app flag for CLI commands |
| Using Heroku CLI | Never need to go to Heroku.com, Don't need --app flag on CLI commands | Will have to push separately to Heroku and Github |

Before we get started please do two things:
- [Open a Heroku Account](https://dashboard.heroku.com/)
- [Download the Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)

## Setting Up 

- Create a NodeJS Project and get it to where you're happy with the project

- Create a git repo, the root of the git repo should where the package.json file is

- Heroku needs to know what command to run to start your projects (usually a script `npm run start` or `npm run production`). This will go in a file called the `Procfile` so create a file called `Procfile` in your project root (folder with package.json) and inside of it put something like this.

```web: npm run production```

The `web:` means Heroku is running a web process so it needs to assign the process an HTTP port (provided via the PORT environmental variable) and the `npm run production` is the command to start the application.

- make sure all your code is committed and now we may begin!

## The Heroku CLI Method

- Assuming you've downloaded the HerokuCLI you must first log in to the Heroku CLI using the command `heroku login` which will open the browser to confirm login to your heroku account.

- After logging in we can generate a new Heroku project with the command `heroku create projectName` this will create a new Heroku project in your account with the name you passed (or a random name if you don't specify a name). It will also add a new remote to your local git repository called heroku.

- So all you have to do to push your code to Heroku is push your code to the heroku remote `git push heroku branchName` and when this is done Heroku will immediately begin to deploy your code by downloading all dependencies in your package.json and then running the command specified in `Procfile`

- You may need to specify all of your environmental variables for your application to work, this can be done using the Heroku CLI with the command `heroku config:set KEY=VALUE`

- If you want to see all the current variables you've set `heroku config` these variables are normal environmental variables like using a .env file and will be accessible to anywhere you use the `process.env` object.

## Github Method

- Go to the Heroku.com dashboard and create a new project

- switch to the deployment section of the project and select "github" deployment

- link your GitHub account

- select which repo on your account you want to deploy

- turn on the automatic deploys feature (this will redeploy your app anytime your GitHub is updated so you don't have to make a separate push to Heroku)

- then trigger a manual deployment to get the site initially created

- to set environmental variables go to the settings section of the application dashboard and you'll see a section called "config vars" and here you can add and remove variables.

- You can also use the CLI to add/remove variables but will need the `--app=APP_NAME` flag so it knows which app the command should be run for (usually it looks for a Heroku remote to determine this, but in this case that won't exist).

- On the dashboard, you'll see a button in the upper right area where you can access the logs and run terminal commands directed at your deployed app.

## The Heroku CLI

- If you are using the CLI deployment method you can run the commands as is as long as you are in a folder within your repo.

- If you are using the GitHub deployment method you can run the commands below from anywhere but must include a flag specifying which app to run the command for `--app=APP_NAME`

|Command | Purpose |
|--------|---------|
| `heroku login` | login the cli into heroku |
| `heroku logout` | logout heroku |
| `heroku create PROJECT_NAME` | create a new heroku project |
| `heroku logs --tail` | see the logs for your application for trouble shooting |
| `heroku config` | list all config vars/environmental variables |
| `heroku config:set KEY=VALUE` | set a config var |
| `heroku run TERMINAL_COMMAND` | run a terminal command within the context of your deployed app |
| `heroku run bash` | start a terminal session within your application

- The `heroku run` commands are useful for running one-off scripts and tasks like migrating and seeding databases