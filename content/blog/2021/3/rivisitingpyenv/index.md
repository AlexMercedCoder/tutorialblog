---
title: More on Python Virtual Environments
date: "2021-03-02T12:12:03.284Z"
description: Using Pythons Built in venv module
---

**My Original Article on [Virtual Environments](https://tuts.alexmercedcoder.com/2021/1/pythonvirtualenv/)**

In my previous article, I talked about two ways to create Python virtual environments using mkvirtualenv and pyenv. What I wasn't aware of at the time is that in Python 3.3 and above a native ability to create a virtual environment was added to python.

**REMINDER:** *The Reason we want to make virtual environments is to isolate our project dependency and manage dependency versions, kinda like what a package.json does for us in Javascript, a Gemfile in Ruby, cargo.toml in rust, composer.json in PHP, you get the idea.*

## How to Use the Native Venv Module

#### Create a New Virtual Environment

You may need to write python3, just make sure you're using the command that is python 3.3 or above. You can always run python --version or python3 --version to double-check. If you use pyenv you can manage what version of python the python command uses at any time.

```
python -m venv ~/path/to/where/venv/will/be/created
```

This will create all the folders in that file, so let's say I specified a folder in my current directory called "venv" as the target to create the venv. I can easily activate it like so.

```
source ./venv/bin/activate
```
* use the command "deactivate" to turn off venv

You'll then see it active in your terminal. Although remembering all that may be tricky. Below is some bash function you may want to add to ~/.bashrc or ~/.zshrc that'll make this process easier.

```
function newpyenv {
    mkdir venv
    python -m venv ./venv
}

function usepyenv {
    source ./venv/bin/activate
}
```

If you add this to bshrc/zshrc you can then restart your terminal and these commands will be active.

- newpyenv: Will create venv folder in your current folder and create a venv in that folder

- usepyenv: if you in a folder where the above command was run (the parent folder to the venv folder) run this command to activate the venv

- deactivate: this is always the command to turn off an active virtual environment

### Example

Let's say I create a "Flask" folder for creating Flask applications, I can create a virtual environment to share with all my flask apps by running "newpyenv" which I can then activate by running "usepyenv" in my Flask folder before jumping into one of my projects.

You could also use this on a per-project basis, whatever you prefer. Hopefully, these bash functions make your life easier!