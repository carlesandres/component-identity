import { forwardRef } from "react";

export function UserMenu() {
  return <div data-component="user-menu" />;
}

export const AccountCard = () => {
  return <section data-component="account-card">Account</section>;
};

export const FancyButton = forwardRef<HTMLButtonElement>((props, ref) => {
  return <button ref={ref} data-component="fancy-button" {...props} />;
});

export function Wrapper() {
  return <UserMenu />;
}

function PrivateComponent() {
  return <div />;
}
