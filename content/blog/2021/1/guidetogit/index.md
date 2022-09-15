---
title: Git - A Guide to Understanding and Using Git
date: "2021-01-09T12:12:03.284Z"
description: All The Commands in Words that Make Sense
---

- [VIDEO: Intro to Git](https://www.youtube.com/watch?v=L4zbgo7KFoA&list=PLY6oTPmKnKbYjGEm9nLowExbgkI-epIgg&index=7&t=9s)
- [VIDEO: Working with Git Remotes](https://www.youtube.com/watch?v=TOsVVxXdtu8&list=PLY6oTPmKnKbYjGEm9nLowExbgkI-epIgg&index=9&t=2s)
- [Setting Up SSH](https://www.youtube.com/watch?v=6u84sACs0v0&list=PLY6oTPmKnKbYjGEm9nLowExbgkI-epIgg&index=8)

## What is Version Control

Imagine that you had a camera where you can take photos of yourself. At any time you can take a photo album off the shelf find a particular picture and travel back to that moment.

1. That would be really cool
2. It would be smart to take frequent pictures

This is what git provides us, a way to take photos of files and travel back to different points in those files' lives. In this guide, I hope to explain how to use these features in git to take photos and travel back in time to give you superpowers!

## Getting Started

First thing is to make sure you have git installed, you can do so by running the following command in your bash terminal command line. (If you don't know what Bash is... [Watch this Video](https://www.youtube.com/watch?v=snOP94q34V4&t=2s)).

`git --version`

If you don't get back a version number then google how to install git on your operating system.

## Creating a Repository

Think of a repository as a photo album, it's one collection of photos (they are called commits) of the state of the files in the repository. You generally want a repository to be a particular project or related files, not your whole computer (I reiterate that you really should not make a repo in the root directory of your computer... don't do it).

So let's pretend I have a folder on my computer with a novel I'm writing called "myNovel", I'd direct my terminal command line to that folder and first I should check to make sure I'm not inside an existing git repository by running:

`git status`

**NOTE** The reason why it is important to check is cause you can run into issues when you unintentionally create a git repository inside of another one, so this is a good practice to avoid that headache.

If you get an error that it failed cause the directory is not a git repository then we can move forward with creating a new repository.

`git init`

This command creates a new git repository in the folder you are currently in (so make sure your terminal is in the right folder with the command `pwd`). The information about your repository is stored in a hidden folder in this directory called ".git" which you can see by running the command `ls -la` to display all files hidden or public in the current folder.

This git repository will track all files in this folder and any subfolders inside of it, which is why you shouldn't create more repos inside of those subfolders cause it can be unpredictable when two git repos are monitoring the same files.

## Using My Repository

So going forward the repository will be watching for changes in the files that it is watching, at any moment you can run the command `git status` to see the state of things.

- files listed in red are files that have been changed but not yet added to staging (files ready to be photographed/committed)

- files in green are files in staging waiting to be photographed/committed

To add files to staging there are a few commands:

- `git add file.txt` adds the specified file to staging

- `git add .` adds all the files in the current directory and sub-directories to staging

- `git add -A` adds all files within the repo to staging

So let's say I finish writing the first chapter of my novel, I can add the file to staging and now I want to commit the files so I have it in my photo album/commit history. I can run the commit command.

- `git commit -m "This is the first chapter of the book"`

The -m flag allows you to enter a descriptive message with the command which will make it easier to find commits later. If you forget to add the -m flag it'll open up your terminal's default editor to create a message which can be tricky to exit.

- If you are on mac it will open up vi/vim (you'll notice every line is prefixed with a ~) then to exit type ":wq" the w means write to the file, the q means quit the program.

- If you are on linux it will likely open nano, to exit type ctrl+x it will then ask you for filename just hit enter and confirm that you want to quit just type "y"

The best way to avoid having to deal with the editor is to always use the -m flag and adding a message with the git commit command itself. Again, these commits are like photos that you'll be able to comeback to if you need to reset what the files appear like.

## Remote Repositories

Keeping track of the versions of your files is great but another really fantastic feature of the git is the ease by which you can back up your repository remotely. There are several services that facilitate but the main three places to store a backup of your repository are:

- github.com
- bitbucket.com
- gitlab.com

All three have generous free accounts for you to backup your repositories. So if I wanted to backup the progress on my novel how would I do it.

- I would create an account on github.com

- select "create a new repository"

- select a name

- don't choose any other options like including a readme or gitignore

- create the repository

On the next page you should see a url that looks like this:

`https://github.com/username/nameOfRepository.git`

This url will allow our local repository to push our files to our repository on github.com so its backed up.

- Open your terminal into the folder with your repo (myNovel)

- connect your local repo to your remote repo with this command

`git remote add remoteName https://github.com/username/nameOfRepository.git`

You can replace remoteName with any name you'd like to give this particular remote repo. You can add as many remotes as you want, so you can backup your files to github, bitbucket and gitlab if you'd like.

To see all the current remotes connected to your local repository:

`git remote -v`

To remove a particular remote

`git remote rm remoteName`

To push your code to the remote repository we use the push command

`git push remoteName branchName`

We'll discuss branches soon, but this is how we can push our files over to our remotes.

#### Working from multiple computers

With our remote, we can now facilitate work from multiple computers or even multiple people. So let's say I've written the first two chapters of my novel committing after each one then pushed up the files to github.com.

Later on, I get a new computer and would like to work from that computer. I can use git to clone the remote repo to my new computer with the following command:

`git clone https://github.com/username/nameOfRepository.git`

So now the repo is cloned in a folder in the current directory and I can continue working on my novel committing and pushing up files as I progress. If I switch back to my older computer I can update all the files with all the pushed up changes with the pull command.

`git pull remoteName branchName`

So long as always push my changes I can switch computers easily and pull down the changes, now we are starting to really see the power of git when combined with remote repositories like GitHub.

## Branches

I've now written three chapters but I have an idea for an alternate chapter 3 but I don't want to erase the current chapter 3 I've written. Git offers a feature to create alternate paths called branches. By default when you create a repo you start with a repo called "master" although many in the software development industry have been changing it to "main", [here is how to do it.](https://tuts.alexmercedcoder.dev/2021/1/mastertomain/)

What I will do is create a new branch called new_chapter_3 with the command:

`git checkout -b new_chapter_3`

The -b means to create a new branch which will start as a copy of the branch I was currently on.

To switch between branches I can do the following

`git checkout branchName`

To see the list of all my local branches along with my active branch

`git branch`

#### Merging Branches

So I've been working in my new_chapter_3 branch and I'm happy with the result and am ready to merge the work into my main/master branch.

- switch back to my main/master branch

- run `git merge new_chapter_3`

This will merge the contents of the branch into a new commit.

#### Merge conflicts

Git, when it merges, is comparing histories and when the commit histories don't match up well creates a conflict git can't automatically resolve and will lean on you to fix.

So imagine I been working on my alternative chapter 3, but after I made the branch I also went back to my main/master branch and made additional edits and commits to my original chapter 3 on the main/master branch. These additional commits may work in the same files the commit in my alternative branch is working on and cause of the timing of the commits git doesn't know which changes to prioritize, this creates a merge conflict.

When you merge you'll get a message about the merge conflict and which files they exist in. To fix the merge conflict you need to open up the specified files and look for something that looks like this:

```js

<<<<<<< HEAD
this is the content of the main/master branch
=======
this is the content of the new_chapter_3 branch
>>>>>>> new_chapter_3

```

I need to choose how I want this to appear, save the changes then commit so I can continue working. So when you get a merge conflict don't rush, read the error to see which files need your attention.

#### Pulling a Remote Branch

Sometimes you are working in a team and you need to pull down a branch you don't have locally but exists on the remote repo. For example, maybe I have an editor making edits to my novel which they have made on an editor_edits branch which they have pushed to my repo on GitHub since I added them as a collaborator. How would I pull down that branch so I can view it locally?

- run the command `git fetch` so I locally build an updated list of all remote branches

- create a branch out a particular remote's branch with the command `git checkout --track -b remoteName/editor_edits`

The -b flag signals a new branch and the --track flag signals the branch should follow a branch of a particular remote which we then specify in the command.

## Traveling Back In Time

The git checkout command not only allows you to switch back and forth between switches but also between commits.

To see the current history of commits use the command

`git log`

and you'll see entries like this...

```
commit 570a10827e96c2ef9b74a2e37f5360f3b4396858
Author: Alex Merced <willcodeforfood@alexmerced.com>
Date:   Tue Jan 5 10:10:26 2021 -0500
```

If you wanted to see the state of your files at a particular commit you can do the following.

`git checkout 570a10827e96c2ef9b74a2e37f5360f3b4396858`

This will then revert all the files to where they were at that time. You can't commit while in this "detached head state", so to go back to the current state of things just...

`git checkout master`

To go back to the head of the desired branch. What if you want to work from the previous commit?

You can only make commits to the Head (the most recent commit on the current branch), this means you have two options in making the target commit the Head.

#### reset

`git reset 570a10827e96c2ef9b74a2e37f5360f3b4396858`

This destroys all previous commits till the target commit is once the head. The file changes since the target commit will remain as untracked changes you can decide to work with or use `git clean` to remove.

#### revert

`git revert 570a10827e96c2ef9b74a2e37f5360f3b4396858`

This instead of destroying all previous commits adds a new commit that undoes all the changes since the target commit so the state of files from this new commit matches the state of things from that previous commit. This allows you to maintain those previous commits in case you ever need to revisit them.

## Learning More

This is the core of what you'll do 90% of the time with git, but there is so much more to learn.

- [Learn more about Github.com in there Learning Lab](https://lab.github.com/)

- [Learn about Git rebase](https://www.atlassian.com/git/tutorials/merging-vs-rebasing)

- [Use Degit to Clone with Creating a New Repo](https://www.npmjs.com/package/degit)

- [Watch this video playlist on development tooling](https://www.youtube.com/playlist?list=PLY6oTPmKnKbYjGEm9nLowExbgkI-epIgg)
