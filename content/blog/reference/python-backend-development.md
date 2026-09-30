---
title: "Python Backend Development"
date: "2023-10-21T22:40:16-04:00"
description: "Django is a high-level and open-source web framework written in Python that encourages rapid development and clean, pragmatic design."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

### What is Django and Getting Started
#### What is Django?
Django is a high-level and open-source web framework written in Python that encourages rapid development and clean, pragmatic design. It follows the Model-View-Controller (MVC) architectural pattern, but in Django, it's referred to as Model-View-Template (MVT).

Django provides a robust set of tools and libraries for building web applications, making it a popular choice for developers. Some of its key features include:

**Built-in Admin Interface:** Django includes an admin interface for managing application data, which can be customized to suit your needs.

**ORM (Object-Relational Mapping):** Django's ORM allows you to interact with your database using Python code, abstracting away much of the SQL database interaction.

**URL Routing:** Django has a flexible URL routing system that helps you map URLs to views.

**Template Engine:** It includes a powerful template system for generating HTML dynamically.

**Security:** Django includes built-in security features to protect against common web vulnerabilities, such as cross-site scripting (XSS) and SQL injection.

**Scalability:** Django is scalable and can handle applications of all sizes, from small projects to large and complex web applications.

#### Getting Started with Django
To get started with Django, follow these steps:

##### 1. Installation
First, make sure you have Python installed on your system (Django requires Python 3.6 or later). Then, install Django using pip:

```
pip install Django
```

##### 2. Create a Django Project
To create a new Django project, run the following command:

```
django-admin startproject projectname
```

Replace projectname with the desired name of your project. This command will create a project directory with the necessary files and structure.

##### 3. Create a Django App
Django projects are organized into apps. You can create a new app within your project using the following command:

```
python manage.py startapp appname
```

Replace appname with the name of your app. This command will create a directory for your app with the required files.

### Models in Django and How to Write Them
In Django, models represent the structure and schema of your application's database tables. Models are defined as Python classes, allowing you to create, retrieve, update, and delete records in your database using Python code, without having to write SQL queries manually. This section will cover the basics of writing models in Django.

#### Defining a Model
To define a model in Django, you need to create a Python class that inherits from django.db.models.Model. Each attribute of the class represents a field in the corresponding database table. Django provides a variety of field types to suit different data types and relationships.

Here's an example of a simple Django model for a blog application:

python
```py
from django.db import models

class BlogPost(models.Model):
    title = models.CharField(max_length=200)
    content = models.TextField()
    pub_date = models.DateTimeField('date published')
    author = models.ForeignKey('Author', on_delete=models.CASCADE)

    def __str__(self):
        return self.title
```

In this example:

- BlogPost is the name of the model.
- title, content, pub_date, and author are fields in the model.
- models.CharField and models.TextField are field types for string and text data, respectively.
- models.DateTimeField is used for date and time data.
- models.ForeignKey establishes a many-to-one relationship with the Author model.
#### Model Fields
Django provides various field types to define the type and constraints of your model's attributes. Here are some common field types:

- **CharField:** For short text fields, such as titles or names.
- **TextField:** For longer text fields, such as content or descriptions.
- **IntegerField, FloatField, DecimalField:** For numeric data types.
- **DateField, TimeField, DateTimeField:** For date and time data.
- **BooleanField:** For Boolean (True/False) values.
- **EmailField, URLField:** For email addresses and URLs.
- **ForeignKey:** For establishing relationships between models.
#### Model Methods
You can define methods within your model to perform actions related to the model's data. In the example above, the __str__ method is defined to return a human-readable representation of a BlogPost object, which is helpful for debugging and display purposes.

#### Migrations
After defining your models, you need to create and apply migrations to update your database schema. Migrations are Django's way of tracking and applying changes to the database.

To create migrations, run:

```
python manage.py makemigrations
```

To apply migrations and create the database tables, run:

```
python manage.py migrate
```

#### Admin Interface
Django provides a built-in admin interface that allows you to manage your application's data. To make your models accessible in the admin interface, you can register them in the admin.py file of your app. Here's an example:

```py
from django.contrib import admin
from .models import BlogPost

admin.site.register(BlogPost)
```

This allows you to create, view, update, and delete BlogPost objects through the admin interface.

### Writing Django Views
#### What are Django Views?
In Django, views are Python functions or classes that handle HTTP requests and return HTTP responses. Views encapsulate the logic of your web application, determining what content to display or what action to take when a user visits a specific URL. Views can generate HTML content, return JSON data, process form submissions, and perform various other tasks.

#### How to Write Function Views
##### 1. Create a Function View
To write a function view, define a Python function that takes an HTTP request as its argument and returns an HTTP response. Here's a simple example of a function view that returns "Hello, World!" as an HTML response:

```py
from django.http import HttpResponse

def hello_world(request):
    return HttpResponse("Hello, World!")
```
##### 2. Map View to URL
To connect the view to a URL, you need to define a URL pattern. This is typically done in the urls.py file of your Django app. For example:

```py
from django.urls import path
from . import views

urlpatterns = [
    path('hello/', views.hello_world, name='hello-world'),
]
```
In this example, the hello_world function view is mapped to the URL /hello/.

#### How to Write Class-Based Views
Class-based views (CBVs) are another way to define views in Django. They provide a more structured and reusable approach for handling HTTP requests.

##### 1. Create a Class-Based View
Here's an example of a class-based view that accomplishes the same task as the function view above:

```py
from django.http import HttpResponse
from django.views import View

class HelloWorldView(View):
    def get(self, request):
        return HttpResponse("Hello, World!")
```

##### 2. Map View to URL
To map a class-based view to a URL, you can use the as_view() method when defining URL patterns:

```py
from django.urls import path
from .views import HelloWorldView

urlpatterns = [
    path('hello/', HelloWorldView.as_view(), name='hello-world'),
]
```
#### Connecting Views to URLs
In Django, you connect views to URLs by defining URL patterns in your app's urls.py file. Each URL pattern associates a URL path with a specific view. You can use regular expressions and path converters to capture dynamic parts of URLs.

##### Using Multiple url.py Files by App
For larger Django projects, it's common to organize your URLs into multiple url.py files, one per app. This helps keep your project structure clean and maintainable.

To achieve this:

Create a urls.py file in the app's directory if it doesn't already exist.

Define the URL patterns specific to the app in that urls.py file.

Include the app's URLs in the project's main urls.py file using include():

```py
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('app/', include('myapp.urls')),
]
```

This allows you to maintain separate URL configurations for each app within your project.

In summary, Django views are the heart of your web application, handling HTTP requests and generating responses. You can write views as simple function-based views or use class-based views for more complex logic. By connecting views to URLs, you define how users access different parts of your application. Organizing URLs with multiple url.py files by app helps keep your Django project organized and maintainable as it grows.

### Django Rest Framework (DRF) and How to Use It
#### What is Django Rest Framework (DRF)?
Django Rest Framework (DRF) is a powerful and flexible toolkit for building Web APIs in Django applications. It simplifies the process of creating RESTful APIs by providing a set of reusable components and tools. DRF is widely used for building APIs for web and mobile applications, and it follows Django's "batteries-included" philosophy, making it easy to integrate with existing Django projects.

#### Key Features of DRF
Serialization: DRF provides serializers that allow you to convert complex data types (e.g., Django model instances) into native Python data types, making it easy to render them into JSON, XML, or other content types.

- **Views:** DRF includes a variety of generic views for common API patterns, such as retrieving a list of objects or a single object, creating, updating, and deleting objects.

- **Authentication:** It offers robust authentication support, including built-in support for session authentication, token authentication, and OAuth.

- **Permissions:** DRF allows you to set granular permissions for API views, controlling who can access and modify data.

- **Throttling:** You can set rate limits on your APIs to prevent abuse and ensure fair usage.

- **Pagination:** DRF provides flexible pagination options for handling large datasets.

- **Browsable API:** It offers a browsable web API, which allows developers to interact with the API using a web interface similar to Django's admin interface.

#### How to Use DRF
To use Django Rest Framework in your Django project, follow these steps:

##### 1. Install DRF
Install DRF using pip:

```shell
pip install djangorestframework
```

##### 2. Add DRF to Installed Apps
In your Django project's settings (settings.py), add 'rest_framework' to the INSTALLED_APPS list:

```py
INSTALLED_APPS = [
    # ...
    'rest_framework',
]
```

##### 3. Create a Serializer
A serializer in DRF defines how data should be converted to and from Python objects. You can create serializers by subclassing serializers.Serializer or using serializers.ModelSerializer for database models. For example:

```py
from rest_framework import serializers

class MyModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = MyModel
        fields = '__all__'
```

##### 4. Create API Views
Define views for your API by creating Python classes that subclass DRF's generic views. For example, to create a view for listing and creating objects, you can use ListCreateAPIView:

```py
from rest_framework import generics
from .models import MyModel
from .serializers import MyModelSerializer

class MyModelListCreateView(generics.ListCreateAPIView):
    queryset = MyModel.objects.all()
    serializer_class = MyModelSerializer
```

##### 5. Configure URLs
Define URL patterns for your API views in your app's urls.py file. Use DRF's router for easy URL routing:

```py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MyModelListCreateView

router = DefaultRouter()
router.register(r'mymodels', MyModelListCreateView)

urlpatterns = [
    path('', include(router.urls)),
]
```

##### 6. Configure Authentication and Permissions
Set up authentication classes and permissions in your project's settings to secure your API endpoints as needed.

##### 7. Test and Document Your API
DRF provides tools for testing your API and generating interactive API documentation. You can use the built-in APITestCase class for testing and generate documentation using tools like drf-yasg.

##### 8. Run Your Project
Finally, run your Django project as usual:

```
python manage.py runserver
```

Your Django Rest Framework-powered API should now be accessible at the defined endpoints, allowing you to create, retrieve, update, and delete data using RESTful conventions.

## Understanding Python Web Apps in Production

### WSGI and ASGI
#### WSGI (Web Server Gateway Interface)
WSGI, which stands for Web Server Gateway Interface, is a specification for a standardized interface between web servers and Python web applications. It defines a common protocol that allows web servers to communicate with Python web applications in a consistent way. WSGI is widely used for traditional synchronous Python web applications.

##### Key points about WSGI:

- It's a simple and well-established interface that enables interoperability between Python web applications and web servers.
- WSGI applications are typically synchronous, meaning they handle one request at a time.

#### ASGI (Asynchronous Server Gateway Interface)
ASGI, or Asynchronous Server Gateway Interface, is an evolution of WSGI designed to support asynchronous Python web applications. Asynchronous programming allows for improved concurrency and scalability, making it well-suited for handling a large number of concurrent connections or long-lived connections, such as WebSocket connections.

##### Key points about ASGI:

- ASGI extends the capabilities of WSGI to support asynchronous code and is particularly useful for real-time applications.
- It allows Python web applications to handle multiple concurrent requests efficiently.

### Gunicorn and Uvicorn
#### Gunicorn
Gunicorn, short for Green Unicorn, is a production-ready WSGI HTTP server for Python applications. It's a popular choice for deploying synchronous Python web applications, such as those built with Django or Flask.

##### How to use Gunicorn with Python web apps:

Install Gunicorn: You can install Gunicorn using a package manager like pip.

```bash
pip install gunicorn
```

Start Gunicorn: Navigate to your Python web application's directory and start Gunicorn with your application's entry point.

```bash
gunicorn myapp:app
```

Here, myapp should be replaced with the name of your Python module containing the WSGI application (often named app).

Gunicorn will start serving your application on a specified host and port.

#### Uvicorn
Uvicorn is an ASGI server that is specifically designed for running asynchronous Python web applications. It's often used with web frameworks like FastAPI and Starlette, which leverage asynchronous programming for improved performance.

##### How to use Uvicorn with Python ASGI web apps:

Install Uvicorn: You can install Uvicorn using pip.

```bash
pip install uvicorn
```

Start Uvicorn: Run Uvicorn with your ASGI application's entry point.

```bash
uvicorn myapp:app
```

Here, myapp should be replaced with the name of your Python module containing the ASGI application (also often named app).

Uvicorn will start serving your ASGI application on a specified host and port.

### Using Them with Python Web Apps
To use Gunicorn or Uvicorn with your Python web application:

Ensure that your web application is WSGI-compliant for Gunicorn or ASGI-compliant for Uvicorn, depending on your choice.

Install the respective server (Gunicorn or Uvicorn) using pip.

Start the server by specifying your application's entry point, usually in the format module_name:app.

Configure the server with additional settings as needed, such as specifying the host and port to listen on, the number of worker processes, and other performance-related parameters.

Deploy your application with the chosen server to make it accessible over the web.

By using Gunicorn or Uvicorn in conjunction with your Python web application, you can serve your application to users, taking advantage of their features for handling concurrent requests and optimizing performance based on your application's specific needs.

### Gunicorn Configuration Flags

1. `-b` or `--bind`: Specifies the network interface and port on which Gunicorn should listen for incoming connections. Example: `-b 0.0.0.0:8000` to bind to all available network interfaces on port 8000.

2. `-w` or `--workers`: Sets the number of worker processes Gunicorn should spawn to handle incoming requests. Example: `-w 4` for four worker processes.

3. `--threads`: Specifies the number of threads per worker process. Threads can be useful for handling I/O-bound tasks. Example: `--threads 2` for two threads per worker process.

4. `--worker-class`: Specifies the type of worker process to use. Common options include `sync` (synchronous workers), `eventlet` (for Eventlet-based asynchronous workers), and `gevent` (for Gevent-based asynchronous workers).

5. `--preload`: Preloads the application code into memory before forking worker processes. This can help reduce response time and improve reliability.

6. `--max-requests`: Defines the maximum number of requests a worker process will handle before it is gracefully restarted. This can help mitigate memory leaks.

7. `--timeout`: Sets the maximum time a worker process is allowed to handle a request. Requests that exceed this timeout are terminated. Example: `--timeout 30`.

8. `--graceful-timeout`: Specifies the timeout for gracefully shutting down worker processes during a reload or stop operation.

9. `--access-logfile` and `--error-logfile`: Configures the log files for access and error logs. Example: `--access-logfile access.log` and `--error-logfile error.log`.

10. `--log-level`: Sets the log level (e.g., `debug`, `info`, `warning`, `error`, `critical`) for Gunicorn's logs.

### Uvicorn Configuration Flags

1. `--host` and `--port`: Specifies the host and port on which Uvicorn should listen for incoming connections. Example: `--host 0.0.0.0 --port 8000`.

2. `--workers`: Sets the number of worker processes that Uvicorn should use. Similar to Gunicorn, this flag determines the degree of concurrency.

3. `--proxy-headers`: Enables the parsing of headers like `X-Forwarded-For` and `X-Forwarded-Proto` to handle reverse proxy configurations.

4. `--reload`: Enables automatic reloading of the application whenever code changes are detected. This is useful for development environments.

5. `--loop`: Specifies the ASGI event loop implementation to use. Options include `asyncio`, `uvloop`, and others.

6. `--limit-concurrency`: Limits the maximum number of simultaneous connections to the application. Useful for controlling concurrency.

7. `--limit-max-requests`: Limits the maximum number of requests a worker process will handle before it is restarted.

8. `--timeout-keep-alive`: Sets the maximum time to keep an idle HTTP keep-alive connection open.

9. `--access-log`: Configures access logging. Example: `--access-log myapp_access.log`.

10. `--error-log`: Configures error logging. Example: `--error-log myapp_error.log`.

## Using Flask for Web Development
Flask is a lightweight and flexible web framework for Python. It's widely used for developing web applications and APIs. In this section, we'll explore the basics of setting up a Flask project, defining routes, using templates, sending JSON responses, and enabling CORS.

### Setting Up a Flask Project:
**Installation**: Start by installing Flask using pip:

```
pip install Flask
```

**Project Structure**: Organize your project structure with a directory for templates (HTML files) and another for static files (e.g., CSS, JavaScript). Here's a basic project structure:

```shell
myflaskapp/
├── app.py
├── templates/
│   ├── index.html
├── static/
│   ├── style.css
```

**Creating a Flask App**: In your app.py file, import Flask and create a Flask app:

```py
from flask import Flask

app = Flask(__name__)
```
### Writing Routes:
Routes define the URLs that your application responds to. You can define routes using the @app.route decorator. Here's an example route that renders an HTML template:

```py
@app.route('/')
def index():
    return render_template('index.html')
```
### Using Templates:
Flask supports rendering templates using the Jinja2 templating engine. You can pass variables to templates and use them to generate dynamic content. For example, in your index.html template:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Flask App</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='style.css') }}">
</head>
<body>
    <h1>Welcome to My Flask App</h1>
    <p>{{ message }}</p>
</body>
</html>
```

In your route function:

```py
@app.route('/')
def index():
    message = "Hello, Flask!"
    return render_template('index.html', message=message)
```
### Sending JSON Responses:
To send JSON responses, you can use Flask's jsonify function. Here's an example route that returns a JSON response:

```py
from flask import jsonify

@app.route('/api/data')
def api_data():
    data = {"message": "This is JSON data"}
    return jsonify(data)
```
### Enabling CORS:
If you need to enable Cross-Origin Resource Sharing (CORS) for your API, you can use the Flask-CORS extension. First, install it:

```bash
pip install flask-cors
```
Then, initialize and configure it in your Flask app:

```py
from flask_cors import CORS


CORS(app)
```
This allows your API to respond to requests from different domains.

Flask provides a simple and flexible way to build web applications and APIs. By following these steps, you can set up a Flask project, define routes, use templates, send JSON responses, and enable CORS as needed for your application.

## Working with FastAPI
FastAPI is a modern, fast (high-performance), web framework for building APIs with Python 3.7+ based on standard Python type hints. It's designed to be easy to use, highly performant, and suitable for both beginners and experienced developers. In this section, we'll explore the basics of setting up a FastAPI project, defining routes, sending JSON responses, and enabling CORS.

### Setting Up a FastAPI Project:
Installation: Start by installing FastAPI using pip:

```bash
pip install fastapi
```
### Project Structure: 
Organize your project structure as needed. Here's a basic project structure:

```bash
myfastapiapp/
├── main.py
```
### Creating a FastAPI App: 
In your main.py file, import FastAPI and create a FastAPI app:

```py
from fastapi import FastAPI

app = FastAPI()
```
### Writing Routes:
Routes in FastAPI are defined using Python functions and standard Python type hints. You can use decorators to define routes and specify HTTP methods. Here's an example route that returns "Hello, FastAPI!" as a response:

```py
@app.get('/')
def read_root():
    return {"message": "Hello, FastAPI!"}
```
### Sending JSON Responses:
FastAPI makes it easy to send JSON responses. Just return Python dictionaries or Pydantic models from your route functions, and FastAPI will automatically convert them to JSON. Here's an example of a route that returns JSON data:

```py
from typing import Dict

@app.get('/api/data')
def get_data() -> Dict[str, str]:
    data = {"message": "This is JSON data"}
    return data
```
### Enabling CORS:
To enable Cross-Origin Resource Sharing (CORS) for your FastAPI application, you can use the fastapi.middleware.cors module. First, install it:

```bash
pip install fastapi[all]
```
Then, add CORS middleware to your FastAPI app:

```py
from fastapi.middleware.cors import CORSMiddleware

# Define allowed origins, methods, and headers as needed
origins = [
    "http://localhost",
    "http://localhost:3000",  # Example: Allow requests from a specific domain
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
```

This configuration allows your FastAPI application to accept requests from the specified origins.

FastAPI is a powerful and modern web framework for building APIs with Python. By following these steps, you can set up a FastAPI project, define routes, send JSON responses, and enable CORS to build robust and performant APIs.

## SQLAlchemy: A Python SQL Toolkit and Object-Relational Mapping (ORM) Library
SQLAlchemy is a popular Python library that provides a set of high-level API for interacting with relational databases. It offers both a SQL expression language and an Object-Relational Mapping (ORM) framework, allowing developers to work with databases using Python objects and queries. SQLAlchemy is widely used in web development, data applications, and other projects that require database interaction.

### Example of How to Use SQLAlchemy with Flask:
Flask is a popular web framework for building web applications in Python. SQLAlchemy integrates seamlessly with Flask to provide database support. Here's an example of how to set up SQLAlchemy with Flask:

#### Installation: 
First, install Flask and SQLAlchemy using pip:

```bash
pip install Flask SQLAlchemy
```
#### Creating a Flask App: 
In your Flask application, create an instance of the Flask app and configure the database URL. For example:

```py
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///mydatabase.db'
db = SQLAlchemy(app)
```
This configures Flask to use an SQLite database named mydatabase.db. You can replace it with the URL of your preferred database (e.g., PostgreSQL, MySQL).

#### Defining Database Models: 
Define your database models as Python classes using SQLAlchemy's ORM. For example:

```py
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

    def __repr__(self):
        return f'<User {self.username}>'
```
#### Creating and Using the Database: 
You can create the database and interact with it using SQLAlchemy's API. For example, to create the tables defined in your models:

```py
with app.app_context():
    db.create_all()
```
#### Using SQLAlchemy in Routes: 
In your Flask routes, you can use SQLAlchemy to perform database operations. For instance, to create a new user:

```py
@app.route('/create_user/<username>/<email>')
def create_user(username, email):
    user = User(username=username, email=email)
    db.session.add(user)
    db.session.commit()
    return 'User created successfully'
```
### Example of How to Use SQLAlchemy with FastAPI:
FastAPI is another modern Python web framework that can be used with SQLAlchemy for building APIs. Here's an example of how to set up SQLAlchemy with FastAPI:

#### Installation: 
Install FastAPI, SQLAlchemy, and the required database driver using pip:

```bash
pip install fastapi[all] sqlalchemy
```
#### Creating a FastAPI App: 
In your FastAPI application, create an instance of the FastAPI app and configure the database URL. For example:

```py
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

app = FastAPI()

# Configure the database URL
DATABASE_URL = 'sqlite:///./mydatabase.db'
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
```

Replace the database URL with your preferred database connection string.

#### Defining Database Models: 
Define your database models as Python classes using SQLAlchemy's ORM. For example:

```py
from sqlalchemy import Column, Integer, String

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
```
#### Creating and Using the Database: 
Create the database tables defined in your models:

```py
from sqlalchemy.orm import Session

def create_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```
#### Using SQLAlchemy in FastAPI Routers: 
In your FastAPI routers, you can use SQLAlchemy to perform database operations. For instance, to create a new user:

```py
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from .models import User
from .database import get_db

def create_user(db: Session = Depends(get_db), username: str, email: str):
    user = User(username=username, email=email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

These examples demonstrate how to use SQLAlchemy with Flask and FastAPI for database operations in your web applications and APIs. SQLAlchemy provides a powerful and flexible way to work with databases using Python.