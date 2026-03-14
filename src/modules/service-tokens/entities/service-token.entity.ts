import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('service_token')
export class ServiceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  tokenHash: string;

  @Column()
  schoolId: number;

  @Column()
  label: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
