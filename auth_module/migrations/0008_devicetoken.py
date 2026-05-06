# Generated migration for DeviceToken model

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('auth_module', '0007_gateentry_card_snapshot_gateentry_face_snapshot_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeviceToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('token', models.TextField(unique=True)),
                ('device_name', models.CharField(blank=True, max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('registered_at', models.DateTimeField(auto_now_add=True)),
                ('last_used', models.DateTimeField(auto_now=True)),
                ('deactivated_at', models.DateTimeField(blank=True, null=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent', models.TextField(blank=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='device_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Device Token',
                'verbose_name_plural': 'Device Tokens',
                'db_table': 'device_tokens',
                'ordering': ['-last_used'],
            },
        ),
        migrations.AddIndex(
            model_name='devicetoken',
            index=models.Index(fields=['user', 'is_active'], name='device_tokens_user_id_is_active_idx'),
        ),
        migrations.AddIndex(
            model_name='devicetoken',
            index=models.Index(fields=['token'], name='device_tokens_token_idx'),
        ),
    ]
