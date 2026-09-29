import { useEffect, useState } from 'react';
import { KeyRound, LogOut, Save, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InlineNotice, LoadingBlock } from '@/components/ui/feedback';
import { Input, Textarea, numberPad } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import {
  useChangePassword,
  useCreateUser,
  useSettings,
  useUpdateSettings,
  useUsers,
} from '@/hooks/use-queries';
import { dateTime } from '@/lib/format';

export default function Settings(): JSX.Element {
  const { user, signOut } = useAuth();
  const toast = useToast();
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: users } = useUsers();
  const isOwner = user?.role === 'OWNER';
  const [userOpen, setUserOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [form, setForm] = useState({
    shopName: '',
    contact1Name: '',
    contact1Number: '',
    contact2Name: '',
    contact2Number: '',
    address: '',
    serviceDescription: '',
    upiId: '',
    receiptInformation: '',
    billFooter: '',
    allowNegativeStock: false,
  });

  // The server is the source of truth for settings, so mirror them in.
  useEffect(() => {
    if (!settings) return;
    setForm({
      shopName: settings.shopName,
      contact1Name: settings.contact1Name,
      contact1Number: settings.contact1Number,
      contact2Name: settings.contact2Name,
      contact2Number: settings.contact2Number,
      address: settings.address,
      serviceDescription: settings.serviceDescription,
      upiId: settings.upiId,
      receiptInformation: settings.receiptInformation,
      billFooter: settings.billFooter,
      allowNegativeStock: settings.allowNegativeStock,
    });
  }, [settings]);

  if (isLoading && !settings) return <LoadingBlock label="Loading settings..." />;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async (): Promise<void> => {
    if (!form.shopName.trim()) {
      toast.error('Shop name is required');
      return;
    }
    try {
      const response = await updateSettings.mutateAsync(form);
      if (response.warning) toast.warning(response.warning.message);
      else toast.success('Settings saved', 'New bills will use these details.');
    } catch (caught) {
      toast.error('Could not save settings', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        title="Settings"
        subtitle="Shop details printed on every bill"
        action={
          <Button loading={updateSettings.isPending} onClick={() => void save()} className="gap-2">
            <Save className="h-5 w-5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Shop Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Shop Name" htmlFor="shop-name">
            <Input
              id="shop-name"
              value={form.shopName}
              onChange={(event) => set('shopName', event.target.value)}
              disabled={!isOwner}
              className="h-14 text-lg"
            />
          </Field>

          <Field label="Address" htmlFor="shop-address">
            <Textarea
              id="shop-address"
              value={form.address}
              onChange={(event) => set('address', event.target.value)}
              disabled={!isOwner}
              className="min-h-[70px]"
            />
          </Field>

          <Field
            label="What You Repair"
            htmlFor="shop-services"
            hint="Printed on the bill so customers remember you."
          >
            <Textarea
              id="shop-services"
              value={form.serviceDescription}
              onChange={(event) => set('serviceDescription', event.target.value)}
              disabled={!isOwner}
              className="min-h-[70px]"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Contact" htmlFor="contact1-name">
              <Input
                id="contact1-name"
                value={form.contact1Name}
                onChange={(event) => set('contact1Name', event.target.value)}
                disabled={!isOwner}
              />
            </Field>
            <Field label="Number" htmlFor="contact1-number">
              <Input
                id="contact1-number"
                {...numberPad}
                value={form.contact1Number}
                onChange={(event) => set('contact1Number', event.target.value)}
                disabled={!isOwner}
                className="tabular"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Second Contact" htmlFor="contact2-name" optional>
              <Input
                id="contact2-name"
                value={form.contact2Name}
                onChange={(event) => set('contact2Name', event.target.value)}
                disabled={!isOwner}
              />
            </Field>
            <Field label="Number" htmlFor="contact2-number" optional>
              <Input
                id="contact2-number"
                {...numberPad}
                value={form.contact2Number}
                onChange={(event) => set('contact2Number', event.target.value)}
                disabled={!isOwner}
                className="tabular"
              />
            </Field>
          </div>
          <Field label="UPI ID" htmlFor="upi-id" optional hint="Shown on the bill for digital payment.">
            <Input
              id="upi-id"
              value={form.upiId}
              onChange={(event) => set('upiId', event.target.value)}
              disabled={!isOwner}
              placeholder="shop@upi"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bill Text</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Receipt / Warranty Information" htmlFor="receipt-info">
            <Textarea
              id="receipt-info"
              value={form.receiptInformation}
              onChange={(event) => set('receiptInformation', event.target.value)}
              disabled={!isOwner}
              className="min-h-[70px]"
            />
          </Field>
          <Field label="Bill Footer" htmlFor="bill-footer" optional>
            <Input
              id="bill-footer"
              value={form.billFooter}
              onChange={(event) => set('billFooter', event.target.value)}
              disabled={!isOwner}
              placeholder="Thank you, visit again!"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-success" /> Stock Safety
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            disabled={!isOwner}
            onClick={() => set('allowNegativeStock', !form.allowNegativeStock)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-border p-3 text-left disabled:opacity-60"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Allow stock to go below zero</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Keep this off. With it off, the app refuses to remove stock you do not have, so
                the count never drifts.
              </p>
            </div>
            <span
              className={cn2(
                'flex h-8 w-14 shrink-0 items-center rounded-full p-1 transition-colors',
                form.allowNegativeStock ? 'justify-end bg-destructive' : 'justify-start bg-muted',
              )}
            >
              <span className="h-6 w-6 rounded-full bg-white shadow" />
            </span>
          </button>
          <InlineNotice tone={form.allowNegativeStock ? 'warning' : 'success'}>
            {form.allowNegativeStock
              ? 'Negative stock is allowed. Someone must remember to correct the count later.'
              : 'Negative stock is blocked. This is the safe setting.'}
          </InlineNotice>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" /> Accounts
            </CardTitle>
            {isOwner ? (
              <Button variant="outline" size="sm" onClick={() => setUserOpen(true)} className="gap-1.5">
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(users ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border-2 border-border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {item.name}
                  {item.id === user?.id ? ' (you)' : ''}
                </p>
                <p className="truncate text-xs text-muted-foreground">@{item.username}</p>
              </div>
              <Badge variant={item.role === 'OWNER' ? 'info' : 'secondary'}>
                {item.role === 'OWNER' ? 'Owner' : 'Staff'}
              </Badge>
            </div>
          ))}
          {isOwner ? null : (
            <p className="text-xs text-muted-foreground">
              Ask the person who set up the app to add an account.
            </p>
          )}
          <Button variant="outline" className="mt-1 w-full gap-2" onClick={() => setPasswordOpen(true)}>
            <KeyRound className="h-4 w-4" /> Change my password
          </Button>
        </CardContent>
      </Card>

      {settings ? (
        <p className="text-center text-2xs text-muted-foreground">
          Settings last changed {dateTime(settings.updatedAt)}
        </p>
      ) : null}

      {/*
        Which build is actually on this screen. The app updates itself in the
        background, so "the change did not show up" is usually an old build still
        open - and this answers that in one glance instead of by guessing.
      */}
      <p className="text-center text-2xs text-muted-foreground">
        App version {dateTime(__BUILD_TIME__)}
      </p>

      <Button variant="outline" className="w-full gap-2" onClick={signOut}>
        <LogOut className="h-5 w-5" /> Sign out
      </Button>

      <AddUserSheet open={userOpen} onOpenChange={setUserOpen} />
      <ChangePasswordSheet open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}

/** Self-service password change, so the default password can be replaced. */
function ChangePasswordSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const toast = useToast();
  const changePassword = useChangePassword();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [touched, setTouched] = useState(false);

  const currentError = form.currentPassword ? '' : 'Enter your current password';
  const newError = form.newPassword.length >= 4 ? '' : 'At least 4 characters';
  const confirmError =
    !form.confirm ? 'Re-type the new password' : form.confirm === form.newPassword ? '' : 'Both passwords must match';
  const sameError =
    form.newPassword && form.currentPassword && form.newPassword === form.currentPassword
      ? 'Choose a different password'
      : '';
  const error = currentError || newError || confirmError || sameError;

  const set = (key: keyof typeof form, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async (): Promise<void> => {
    setTouched(true);
    if (error) return;
    try {
      await changePassword.mutateAsync({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Password changed', 'Use your new password next time you sign in.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setTouched(false);
      onOpenChange(false);
    } catch (caught) {
      toast.error('Could not change password', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Change password"
      description="Use this to replace the password you were given."
    >
      <div className="space-y-3 pb-2">
        <Field label="Current Password" htmlFor="pw-current" error={touched ? currentError || null : null}>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={form.currentPassword}
            onChange={(event) => set('currentPassword', event.target.value)}
            invalid={touched && Boolean(currentError)}
          />
        </Field>
        <Field label="New Password" htmlFor="pw-new" error={touched ? newError || sameError || null : null}>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={(event) => set('newPassword', event.target.value)}
            invalid={touched && Boolean(newError || sameError)}
          />
        </Field>
        <Field label="Re-type New Password" htmlFor="pw-confirm" error={touched ? confirmError || null : null}>
          <Input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(event) => set('confirm', event.target.value)}
            invalid={touched && Boolean(confirmError)}
          />
        </Field>
        <Button
          size="lg"
          className="w-full"
          loading={changePassword.isPending}
          onClick={() => void save()}
        >
          Save New Password
        </Button>
      </div>
    </Sheet>
  );
}

function AddUserSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  const toast = useToast();
  const createUser = useCreateUser();
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'STAFF' });
  const [touched, setTouched] = useState(false);

  const nameError = form.name.trim() ? '' : 'Name is required';
  const usernameError =
    form.username.trim().length >= 3 ? '' : 'At least 3 characters, no spaces';
  const passwordError = form.password.length >= 4 ? '' : 'At least 4 characters';

  const save = async (): Promise<void> => {
    setTouched(true);
    if (nameError || usernameError || passwordError) return;
    try {
      await createUser.mutateAsync({
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      toast.success('Account created', `${form.name.trim()} can now sign in.`);
      setForm({ name: '', username: '', password: '', role: 'STAFF' });
      setTouched(false);
      onOpenChange(false);
    } catch (caught) {
      toast.error('Could not create account', caught instanceof Error ? caught.message : undefined);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add account"
      description="A name, a username and a password. That is all that is needed to sign in."
    >
      <div className="space-y-3 pb-2">
        <Field label="Full Name" htmlFor="user-name" error={touched ? nameError || null : null}>
          <Input
            id="user-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            invalid={touched && Boolean(nameError)}
            className="h-14"
          />
        </Field>
        <Field label="Username" htmlFor="user-username" error={touched ? usernameError || null : null}>
          <Input
            id="user-username"
            value={form.username}
            autoCapitalize="none"
            onChange={(event) =>
              setForm((current) => ({ ...current, username: event.target.value.replace(/\s/g, '').toLowerCase() }))
            }
            invalid={touched && Boolean(usernameError)}
          />
        </Field>
        <Field label="Password" htmlFor="user-password" error={touched ? passwordError || null : null}>
          <Input
            id="user-password"
            type="text"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            invalid={touched && Boolean(passwordError)}
            hint="Tell them in person. It is stored safely hashed, never as plain text."
          />
        </Field>
        <Field label="Role" htmlFor="user-role">
          <Select
            value={form.role}
            onValueChange={(value) => setForm((current) => ({ ...current, role: value }))}
            options={[
              { value: 'STAFF', label: 'Staff' },
              { value: 'OWNER', label: 'Owner' },
            ]}
          />
        </Field>
        <Button size="lg" className="w-full" loading={createUser.isPending} onClick={() => void save()}>
          Create Account
        </Button>
      </div>
    </Sheet>
  );
}

/** Local class joiner so this file does not need the cn import twice. */
function cn2(...classes: (string | false | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
