---
title: Creating a Consistent Developer Environment with Docker
date: "2022-02-05T12:12:03.284Z"
description: Using Docker to create an Environment in PHP, Ruby, Python and more
---

[VIDEO OVERVIEW OF USING DOCKER IMAGE FROM DOCKER HUB](https://youtu.be/mN5UHsMNm4U)

## Your Dev Environment

Maybe you got a new computer or you have decided to learn programming, either way you'll need to curate your development environment which means installing all the languages, tools and so forth all which can be tedious and require trouble shooting.

I'm here to tell you how you can make life a lot easier for yourself. Instead of installing dozens of tools, just install two things:

- Docker
- Visual Studio Code

- OPTIONAL: Git-Bash (so you have git on windows, git should be out of the box for Max/Linux) 

So google how to install these for your operating system and then we can continue!

## Spinning up our containers

First step is to clone the following git repository anywhere on your computer so open up terminal/git-bash in a folder you want to work out of (I usually have a folder called `development` I do all my dev work in) then run the following command:

`git clone https://github.com/AlexMercedCoder/ez-developer-environment.git`

This will copy several files:

- Dockerfile: This will create our the image of environment

- docker-compose.yml: This can spin up our environment along with a postgres and mongodb database we can access.

We want to make sure git within the images is configured to credit your github account when you commit so inside the docker-compose.yml make sure to update the follow lines with your name and email.

```yml
      args:
        gitusername: "Your Name"
        gitemail: "your@email.com"
```

After that, run the following command then take a break and watch some netflix while the environment is built (the process will only be this long the first time as it installs everything).

```
docker-compose up
```

All the containers should be up and running, if you need to shut off all the containers you can use the command:

```
docker-compose down
```

If you want to turn them on/off individually

```
docker-compose up languages
docker-compose up postgres
docker-compose up mongodb
```

to turn off

```
docker-compose down languages
docker-compose down postgres
docker-compose down mongodb
```

## Attaching to Visual Studio Code

Open up visual studio code to your `development` folder.

Then install the extension `remote-containers`.

Open up the Visual Studio Code command pallette (gear in bottom left)

Look for the "Remote-Containers: Attach to Running Container" command

It should let you select the languages container and you now have the ability to work from that container in VSCode like you normally would on your computer.

If the languages container isn't showing up it may not be on. In a separate terminal just open it up with the command below then try again to attach VSCode.

```
docker-compose run languages /bin/bash/
```
*Keep in mind all docker commands should be done in same folder at docker-compose.yml*

That's it, you now have PHP, Java, Ruby, Node, Deno, Python all available for you to work in without having to install and configure each individually.