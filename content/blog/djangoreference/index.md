---
title: Ultimate Django Reference (Deployment, Rest API, Commands, .env)
date: "2020-08-18T22:12:03.284Z"
description: "A one stop shop for many of the things you'll have to look up a lot"
---

## Basic Commands

Start a new project
`django-admin startproject <projectname>`

Start a new app in your project
`django-admin startapp <appName>`

Run Development Server
`python manage.py runserver`

Make Migration Files for Unmigrated Changes
``python manage.py makemigrations`

Run Migrations
`python manage.py migrate`

Run Development Server
`python manage.py runserver`

Create Superuser for Admin Panel
`python manage.py createsuperuser --email admin@example.com --username admin`

## Setting up the Database for Postgres

Need a psychopg2 installed to use postgres

`pip install psycopg2`

_note: You may need to install the following for psycopg2 to install correct, google their installation, not needed for windows sudo "python3-dev" "libpq-dev"_

**The database configuration in settings.py**

```python
# Database
# https://docs.djangoproject.com/en/3.1/ref/settings/#databases

DATABASES = {

    'default': {

        'ENGINE': 'django.db.backends.postgresql_psycopg2',

        'NAME': 'test',

        'USER': 'test',

        'PASSWORD': 'test',

        'HOST': 'localhost',

        'PORT': '5432',

    }

}

```

## Using a .env file with django

Install django-environ

`pip install django-environ`

Add the following to your settings.py, create the .env file in the same folder as your settings.py

```python
import environ

env = environ.Env()
# reading .env file
environ.Env.read_env()
```

DOCS: https://github.com/joke2k/django-environ

**Using env variables in your code**

`env("ENV_VARIABLE")`

`env("ENV_VARIABLE", default="my default value")`

## Deploying to Heroku

### Step 1 - Adjust your database settings

```python
DATABASES = {

    'default': env.db()

}

```

\*If you want to use your local database add an ENV variable, DATABASE_URL with using the db string template below

`postgres://YourUserName:YourPassword@YourHost:5432/YourDatabase`

Should look like this in your .env

`DATABASE_URL=postgres://test:test@localhost:5432/test`

### Setup Your gitignore

Include this in your .gitignore in your root directory, this was generated using the site gitignore.io, a website for generating common gitignore entries.

```
# Created by https://www.toptal.com/developers/gitignore/api/django
# Edit at https://www.toptal.com/developers/gitignore?templates=django

### Django ###
*.log
*.pot
*.pyc
__pycache__/
local_settings.py
db.sqlite3
db.sqlite3-journal
media

# If your build process includes running collectstatic, then you probably don't need or want to include staticfiles/
# in your Git repository. Update and uncomment the following line accordingly.
# <django-project-name>/staticfiles/

### Django.Python Stack ###
# Byte-compiled / optimized / DLL files
*.py[cod]
*$py.class

# C extensions
*.so

# Distribution / packaging
.Python
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
pip-wheel-metadata/
share/python-wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# PyInstaller
#  Usually these files are written by a python script from a template
#  before PyInstaller builds the exe, so as to inject date/other infos into it.
*.manifest
*.spec

# Installer logs
pip-log.txt
pip-delete-this-directory.txt

# Unit test / coverage reports
htmlcov/
.tox/
.nox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.py,cover
.hypothesis/
.pytest_cache/
pytestdebug.log

# Translations
*.mo

# Django stuff:

# Flask stuff:
instance/
.webassets-cache

# Scrapy stuff:
.scrapy

# Sphinx documentation
docs/_build/
doc/_build/

# PyBuilder
target/

# Jupyter Notebook
.ipynb_checkpoints

# IPython
profile_default/
ipython_config.py

# pyenv
.python-version

# pipenv
#   According to pypa/pipenv#598, it is recommended to include Pipfile.lock in version control.
#   However, in case of collaboration, if having platform-specific dependencies or dependencies
#   having no cross-platform support, pipenv may install dependencies that don't work, or not
#   install all needed dependencies.
#Pipfile.lock

# PEP 582; used by e.g. github.com/David-OConnor/pyflow
__pypackages__/

# Celery stuff
celerybeat-schedule
celerybeat.pid

# SageMath parsed files
*.sage.py

# Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# Spyder project settings
.spyderproject
.spyproject

# Rope project settings
.ropeproject

# mkdocs documentation
/site

# mypy
.mypy_cache/
.dmypy.json
dmypy.json

# Pyre type checker
.pyre/

# pytype static type analyzer
.pytype/

# End of https://www.toptal.com/developers/gitignore/api/django
```

### Gunicorn and the Procfile

We need Gunicorn to run our apps server so 

```pip install gunicorn```

create a file called "Procfile" in your project root with the following.

```web: gunicorn project.wsgi`` 

*project should be replaced with your projects name (the name of the folder your settings.py is in)

### Download django-heroku

install django-heroku
`pip install django-heroku`

add the following at the TOP of your settings.py
`import django_heroku`

add the following at the bottom of your settings.py
`django_heroku.settings(locals())`

\*What this will do is configure your project automatically for Heroku when you deploy it

### Push up to github

Create new github repository, and push to github. The ROOT of your repository should be the folder with the manage.py inside it.

### Create a new Heroku Project

- Create a New Heroku Project

- Go to the resources tab and provision a new free postgres database

- Go to the deploy tab and connect your github repository to heroku

- enable automatic deployments

- do an initial deploy hitting the manual deploy button

- Don't forget to run makemigrations and migrate, (easily done in ```Heroku run bash```)

## Django Rest Framework Reference

### Install

`pip install djangorestframework`

then add the following to your settings.py installed apps array

```'rest_framework',```

**ALSO MAKE SURE YOUR APP IS INSTALLED AS WELL**

### Make a model

In a new app make a new model in ```models.py```.
*model field reference => https://docs.djangoproject.com/en/3.1/ref/models/fields/#model-field-types*

```python
from django.db import models


class Dog(models.Model):

    name = models.CharField(max_length=100)
    age = models.IntegerField()

    class Meta:
        verbose_name_plural = 'dogs'

```

### Setup Models and Serializers in your app

In your app folder create a ```serializers.py``` with the following.

```python
from .models import Dog
from rest_framework import serializers


class DogSerializer(serializers.HyperlinkedModelSerializer):
    class Meta:
        model = Dog
        fields = ['name', 'age']
```

### Create Views for your API

In your apps views.py create the following

```python
from .models import Dog
from rest_framework import viewsets
from rest_framework import permissions
from .serializers import DogSerializer


class DogViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows users to be viewed or edited.
    """
    queryset = Dog.objects.all()
    serializer_class = DogSerializer
    permission_classes = [permissions.AllowAny] #Coule be [permissions.IsAuthenticated]
```
For Details on different permission sets:
- https://www.django-rest-framework.org/api-guide/permissions/
- https://www.django-rest-framework.org/api-guide/views/

### Setup URLS

Now to setup the urls for our API in the urls.py in the folder that holds our settings.py.

```python
from django.contrib import admin
from django.urls import path
from rest_framework import routers
from project1.api import views

router = routers.DefaultRouter()
router.register(r'dogs', views.DogViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    path('admin/', admin.site.urls),
]
```
*For more on how the router works, https://www.django-rest-framework.org/api-guide/routers/*

### Finish Up

- make migrations
- migrate
- test