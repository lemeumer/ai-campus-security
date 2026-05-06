# Generated for the campus Events feature.
# Adds an Event table that admins manage and which feeds the per-role
# event lists in student / faculty / staff / parent portals.

import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('auth_module', '0009_user_approval_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='Event',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('category', models.CharField(
                    choices=[
                        ('ACADEMIC', 'Academic'),
                        ('SPORTS', 'Sports'),
                        ('CULTURAL', 'Cultural'),
                        ('WORKSHOP', 'Workshop'),
                        ('SEMINAR', 'Seminar'),
                        ('NOTICE', 'Notice'),
                        ('OTHER', 'Other'),
                    ],
                    default='OTHER',
                    max_length=20,
                )),
                ('start_time', models.DateTimeField()),
                ('end_time', models.DateTimeField(blank=True, null=True)),
                ('venue', models.CharField(blank=True, max_length=200)),
                ('link', models.URLField(blank=True,
                    help_text='Optional external link — registration form, Zoom, notice PDF…')),
                ('target_roles', models.JSONField(blank=True, default=list,
                    help_text='Role codes that should see this event. Empty list = visible to everyone.')),
                ('status', models.CharField(
                    choices=[('DRAFT', 'Draft'), ('PUBLISHED', 'Published'), ('CANCELLED', 'Cancelled')],
                    default='PUBLISHED',
                    max_length=20,
                )),
                ('poster', models.ImageField(blank=True, null=True, upload_to='events/%Y/%m/')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='events_created',
                    to='auth_module.user',
                )),
            ],
            options={
                'verbose_name': 'Event',
                'verbose_name_plural': 'Events',
                'db_table': 'events',
                'ordering': ['-start_time'],
            },
        ),
        migrations.AddIndex(
            model_name='event',
            index=models.Index(fields=['status', 'start_time'], name='events_status_start_idx'),
        ),
        migrations.AddIndex(
            model_name='event',
            index=models.Index(fields=['start_time'], name='events_start_idx'),
        ),
    ]
