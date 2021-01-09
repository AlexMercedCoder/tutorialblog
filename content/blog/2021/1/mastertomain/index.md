---
title: Git/Github - Making the Switch from Master to Main
date: "2021-01-09T12:12:03.284Z"
description: Getting with the times
---

## Why Should I do this?

Bottom Line, the industry is making the shift of naming a project's default branch, "main", from the prior standard, "master". The change has already been happening so the sooner you get all your settings to change the less tricky it will be to make the adjustment later. So here are some steps in order to make the shift.

## Changing Your Default Github Branch Name

Head over to account settings, then to the repositories section, and change the default branch name for new branches to main. Done!

## Changing your local Git default branch name

As long as your git version 2.28 or above

```git --version```

[Guide to Upgrade Git on Ubuntu](https://www.tipsonunix.com/2020/07/install-git-2-28-0-in-ubuntu-20-04-linux-mint-centos/)

then you can run the following command

```git config --global init.defaultBranch main```

after this command anytime you make a new repository the initial branch will be called main instead of master.

That's it, you are all set to go!

## While we're configuring git...

- [You may want to set up a global gitignore](http://egorsmirnov.me/2015/05/04/global-gitignore-file.html)

- for bash/zsh you may want to add the following function to your configuration to easily push up to git.

```bash
pushy(){

git add .
git commit -m "$1"
git push $2 $3
}
```

the syntax to use...
```pushy "message" remote branch```