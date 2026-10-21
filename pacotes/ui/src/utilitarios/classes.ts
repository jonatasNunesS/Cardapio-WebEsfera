export function juntarClasses(...classes: readonly (string | false | null | undefined)[]): string {
  return classes.filter((classe): classe is string => typeof classe === 'string' && classe !== '').join(' ');
}
