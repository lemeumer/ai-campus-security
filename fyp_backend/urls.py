from django.contrib import admin
from django.conf import settings
from django.urls import path, include, re_path
from django.views.static import serve

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('auth_module.urls')),
]

# Serve uploaded gate snapshots / visitor photos / profile pictures from
# MEDIA_ROOT. django.conf.urls.static.static() silently returns [] when
# DEBUG=False, so we register the serve view directly here. HF Spaces have
# no nginx/caddy in front of gunicorn, so Django must serve /media/ itself.
# In a real production deployment behind a reverse proxy, drop this and let
# the proxy serve the media directory.
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
]
