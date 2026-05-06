from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('auth_module.urls')),
]

# Serve uploaded gate snapshots / visitor photos / profile pictures from
# MEDIA_ROOT in development. In production these should be served by the
# reverse proxy (Nginx/Caddy) instead.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)