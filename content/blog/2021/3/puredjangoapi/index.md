---
title: Django Rest API without DjangoRestFramework
date: "2021-03-01T12:12:03.284Z"
description: In case you were wondering
---

**Find tutorials for django at my website, devNursery.com**

Often times when making a RESTFul API with Django it can seem like... "how would this work in?"

Django has a lot of great aspects to it:

- Modularity, creating chunks of your application as "apps" allows you to reuse and repurpose features you've already created. (example, build out an auth app then just reuse it in all future projects)

- A fairly robust built suite of authentication features

This is all great but when making a microservice or RESTFul API Django can seem a bit clunky (cause its design seems to really be built for handling both the front and backend, a full-stack framework).

This is why we often rely on the DjangoRestFramework library for building RESTful APIs and Microservices with Django (or use alternatives like Flask, FastAPI, Masonite, etc.)

Although, being curious as I am I decided to see what it would look like to create a full crud Restful API with Pure Django and no helper libraries. Below are the results.

models.py
```py
from django.db import models

class Todo(models.Model):
    item = models.CharField(max_length = 100)
```

views.py
```py

from django.shortcuts import render
from django.http import JsonResponse
from themodels.models import Todo
from django.core import serializers
from django.views.decorators.csrf import csrf_exempt
import json

@csrf_exempt ## To exempt from default requirement for CSRF tokens to use postman
def TheModelView(request):

    if (request.method == "GET"):
        #Serialize the data into json
        data = serializers.serialize("json", Todo.objects.all())
        # Turn the JSON data into a dict and send as JSON response
        return JsonResponse(json.loads(data), safe=False)

    if (request.method == "POST"):
        # Turn the body into a dict
        body = json.loads(request.body.decode("utf-8"))
        #create the new item
        newrecord = Todo.objects.create(item=body['item'])
        # Turn the object to json to dict, put in array to avoid non-iterable error
        data = json.loads(serializers.serialize('json', [newrecord]))
        # send json response with new object
        return JsonResponse(data, safe=False)

@csrf_exempt ## To exempt from default requirement for CSRF tokens to use postman
def TheModelViewTwo(request, id):
        if (request.method == "PUT"):
        # Turn the body into a dict
            body = json.loads(request.body.decode("utf-8"))
        # update the item
            Todo.objects.filter(pk=id).update(item=body['item'])
            newrecord = Todo.objects.filter(pk=id)
        # Turn the object to json to dict, put in array to avoid non-iterable error
            data = json.loads(serializers.serialize('json', newrecord))
        # send json response with updated object
            return JsonResponse(data, safe=False)

        if (request.method == "DELETE"):
        # delete the item, get all remaining records for response
            Todo.objects.filter(pk=id).delete()
            newrecord = Todo.objects.all()
        # Turn the results to json to dict, put in array to avoid non-iterable error
            data = json.loads(serializers.serialize('json', newrecord))
        # send json response with updated object
            return JsonResponse(data, safe=False)
```

urls.py
```py
from django.contrib import admin
from django.urls import path
from themodels.views import TheModelView, TheModelViewTwo

urlpatterns = [
    path('admin/', admin.site.urls),
    path('themodel/', TheModelView),
    path('themodel/<int:id>/', TheModelViewTwo)
]

```