---
title: Python Virtual Environment 101
date: "2021-01-27T12:12:03.284Z"
description: Understanding that Pesky Virtual Environment Thing
---

## Why do we care?

In any programming language, you'll inevitably be using code made by other people to make your life easier. These 3rd party chunks of code are referred to as packages, libraries, and frameworks. This brings two challenges...

- There needs to be an easy way to get these packages and use them in my code

- There needs to be a mechanism for me to replicate the setup I have on one computer on another

This is where the all might Package Manager comes in. In the world of Python programming that package manager is known as Pip. 

- Simply by running a ```pip install``` command can I install a python library or framework then use it in my code

- Standard practice is to output the results of ```pip freeze``` to a file called requirements.txt then I can re-download on another pc easily by running ```pip install -r requirements.txt```

## So what's the problem?

Well, pip freeze lists all libraries you've installed and doesn't know which packages below to which projects, or whether they need different versions. So if we just install requirements.txt we may be installing a lot of things we used for other projects when all I need is a subset for a particular project.

## The Solution?

In python, you create a virtual environment. A virtual environment essentially is an isolated copy of python and pip, so when working in the virtual environment the packages you installed are tracked separately so the results of pip freeze will be unique to that environment/project.

## How do we create a virtual environment?

There are two main tools for creating virtual environments

- Pyenv with Pyenv-Virtualenv extension

- virtualenv with virtualenvwrapper (the wrapper gives you super useful commands)

Although, this can be made much easier by using the IDE Pycharm which can build environments for you with your preferred tool making it easy to manage. Although below I'll cover the commands for both if you rather use a different IDE like VSCode or Atom.

## Creating a new virtual environment

**PYENV**

``` pyenv virtualenv <pythonversion> <envname> ```

``` pyenv virtualenv 3.9.0 djangoproject ```

**Virtualenv/VirtualenvWrapper**

``` mkvirtualenv <envname> ```

``` mkvirtualenv djangoproject ```

## Turn on an existing virtual environment

**PYENV**

``` pyenv activate <envname> ```

``` pyenv activate djangoproject ```

**Virtualenv/VirtualenvWrapper**

``` workon <envname> ```

``` workon djangoproject ```

## Turn off an existing virtual environment

**PYENV**

``` deactivate  ```

``` deactivate  ```

**Virtualenv/VirtualenvWrapper**

``` deactivate  ```

``` deactivate  ```

## See a list of existing environments

**PYENV**

```pyenv virtualenvs```

**Virtualenv/VirtualenvWrapper**

``` lsvirtualenv ```

## Removing a VirtualEnv

**PYENV**

```pyenv uninstall <envname>```

**Virtualenv/VirtualenvWrapper**

``` rmvirtualenv ```


## Conclusion

I know when I started with python, Virtual Environments and why they mattered didn't quite make sense to me, so hopefully, this has helped fill in the blanks for you!