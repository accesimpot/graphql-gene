import { Model, Column, AllowNull, Default, Table, DataType, IsEmail } from 'sequelize-typescript'

export
@Table
class Address extends Model {
  @AllowNull(false)
  @Column(DataType.STRING)
  declare address1: string

  @Column(DataType.STRING)
  declare address2: string | null

  @AllowNull(false)
  @Column(DataType.STRING)
  declare city: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare province: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare postalCode: string

  @Default('ca')
  @Column(DataType.STRING)
  declare country: string

  @AllowNull(false)
  @IsEmail
  @Column(DataType.STRING)
  declare email: string

  @Column(DataType.STRING)
  declare phone: string
}
