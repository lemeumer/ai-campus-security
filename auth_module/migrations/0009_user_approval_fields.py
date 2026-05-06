# Generated for admin-controlled approval workflow.
# Adds approved_by / approved_at / rejection_reason to User and expands
# STATUS_CHOICES to include PENDING + REJECTED for self-registrations
# that need admin sign-off before login is allowed.

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('auth_module', '0008_devicetoken'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='approved_by',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='approved_users',
                to='auth_module.user',
                help_text='Admin / director who approved (or rejected) this account',
            ),
        ),
        migrations.AddField(
            model_name='user',
            name='approved_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='user',
            name='rejection_reason',
            field=models.TextField(
                blank=True,
                help_text='Why a registration was rejected — surfaced to admins in the audit log',
            ),
        ),
        migrations.AlterField(
            model_name='user',
            name='status',
            field=models.CharField(
                choices=[
                    ('PENDING', 'Pending Approval'),
                    ('ACTIVE', 'Active'),
                    ('REJECTED', 'Rejected'),
                    ('INACTIVE', 'Inactive'),
                    ('SUSPENDED', 'Suspended'),
                    ('GRADUATED', 'Graduated'),
                ],
                default='ACTIVE',
                max_length=20,
            ),
        ),
    ]
