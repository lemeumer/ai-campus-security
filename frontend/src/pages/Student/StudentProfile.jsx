import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { authApi } from '../../api/auth'
import Modal from '../../components/ui/Modal'
import { StatusBadge } from '../../components/ui/Badge'
import { HiPencil, HiMail, HiPhone, HiIdentification, HiOfficeBuilding, HiShieldCheck, HiUser, HiCalendar } from 'react-icons/hi'
import toast from 'react-hot-toast'

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-slate-400" />
      </div>
      <div>
        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">{value || <span className="text-slate-300 font-normal italic">Not set</span>}</p>
      </div>
    </div>
  )
}

export default function StudentProfile() {
  const { user, refreshProfile } = useAuth()
  const [editOpen, setEditOpen] = useState(false)
  const [pwOpen, setPwOpen]   = useState(false)
  const [form, setForm] = useState({ phone_number: user?.phone_number || '' })
  const [pwForm, setPwForm]   = useState({ old_password: '', new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)

  const saveProfile = async () => {
    setLoading(true)
    try {
      await authApi.updateProfile(form)
      await refreshProfile()
      toast.success('Profile updated')
      setEditOpen(false)
    } catch { toast.error('Update failed') }
    finally { setLoading(false) }
  }

  const changePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm) return toast.error('Passwords do not match')
    setLoading(true)
    try {
      await authApi.changePassword({ old_password: pwForm.old_password, new_password: pwForm.new_password })
      toast.success('Password changed')
      setPwOpen(false)
      setPwForm({ old_password: '', new_password: '', confirm: '' })
    } catch { toast.error('Failed — check your current password') }
    finally { setLoading(false) }
  }

  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`
  const joined = user?.date_joined ? new Date(user.date_joined).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '—'

  return (
    <div className="space-y-6">

      {/* Profile hero card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {/* Cover stripe */}
        <div className="h-24" style={{ background: 'linear-gradient(135deg, #059669, #10b981, #34d399)' }} />

        <div className="px-6 pb-6">
          {/* Avatar floated up */}
          <div className="flex items-end justify-between -mt-10 mb-5">
            <div
              className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg flex items-center justify-center text-2xl font-black text-white"
              style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
            >
              {initials}
            </div>
            <div className="flex gap-2 mt-12">
              <button onClick={() => setPwOpen(true)} className="btn-secondary text-xs px-3 py-2">
                <HiShieldCheck className="w-3.5 h-3.5" /> Change Password
              </button>
              <button onClick={() => setEditOpen(true)} className="btn-primary text-xs px-3 py-2">
                <HiPencil className="w-3.5 h-3.5" /> Edit Profile
              </button>
            </div>
          </div>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{user?.first_name} {user?.last_name}</h2>
              <p className="text-sm text-slate-500">{user?.department} {user?.semester ? `· Semester ${user.semester}` : ''}</p>
              <p className="text-xs text-slate-400 font-mono mt-1">{user?.university_id}</p>
            </div>
            <StatusBadge status={user?.status || 'ACTIVE'} />
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-5">Personal Information</h3>
          <div className="space-y-5">
            <InfoItem icon={HiUser}           label="Full Name"    value={`${user?.first_name} ${user?.last_name}`} />
            <InfoItem icon={HiMail}           label="Email"        value={user?.email} />
            <InfoItem icon={HiPhone}          label="Phone"        value={user?.phone_number} />
            <InfoItem icon={HiIdentification} label="CNIC"         value={user?.cnic} />
            <InfoItem icon={HiCalendar}       label="Joined"       value={joined} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-5">Academic Information</h3>
          <div className="space-y-5">
            <InfoItem icon={HiOfficeBuilding} label="Department"   value={user?.department} />
            <InfoItem icon={HiUser}           label="Program"      value={user?.program} />
            <InfoItem icon={HiCalendar}       label="Semester"     value={user?.semester ? `Semester ${user.semester}` : null} />
            <InfoItem icon={HiUser}           label="Username"     value={user?.username} />
            <InfoItem icon={HiShieldCheck}    label="Role"         value={user?.role} />
          </div>
        </div>

        {(user?.emergency_contact_name || user?.emergency_contact_phone) && (
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-5">Emergency Contact</h3>
            <div className="grid grid-cols-2 gap-5">
              <InfoItem icon={HiUser}  label="Contact Name"  value={user?.emergency_contact_name} />
              <InfoItem icon={HiPhone} label="Contact Phone" value={user?.emergency_contact_phone} />
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profile">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Phone Number</label>
            <input className="input" placeholder="+92 300 1234567" value={form.phone_number} onChange={e => setForm(f => ({...f, phone_number: e.target.value}))} />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={() => setEditOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={saveProfile} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change Password">
        <div className="space-y-4">
          {[
            ['old_password',  'Current Password'],
            ['new_password',  'New Password'],
            ['confirm',       'Confirm New Password'],
          ].map(([k, lbl]) => (
            <div key={k}>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">{lbl}</label>
              <input className="input" type="password" placeholder="••••••••" value={pwForm[k]} onChange={e => setPwForm(f => ({...f, [k]: e.target.value}))} />
            </div>
          ))}
          <div className="flex gap-3 pt-1">
            <button onClick={() => setPwOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={changePassword} disabled={loading} className="btn-primary flex-1">
              {loading ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
